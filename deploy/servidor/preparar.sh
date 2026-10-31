#!/usr/bin/env bash
# Prepara a maquina nova (Ubuntu 24.04 ou 26.04 LTS, puro) para o Relato Facil. Roda uma
# vez, como root, logo depois de criar a VPS. Pode rodar de novo: o que ja esta feito fica.
#
#   scp deploy/servidor/preparar.sh root@<ip>:/root/ && ssh root@<ip> bash /root/preparar.sh
#
# O que faz:
#   1. atualiza o sistema e liga as atualizacoes de seguranca automaticas;
#   2. cria o usuario "deploy" (sudo e docker), com a mesma chave SSH do root;
#   3. SSH so por chave (sem senha);
#   4. firewall: so SSH, 80 e 443 abertos;
#   5. Docker oficial, com rotacao de logs, e o Swarm de um no so;
#   6. 2 GB de swap (folga para montar as imagens) e o fuso de Sao Paulo.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "rode como root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== 1. Sistema"
# Sem perguntas: se um pacote trouxer um arquivo de configuracao novo, fica o que ja existe.
APT_OPCOES=(-yq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
apt-get update -q
apt-get upgrade "${APT_OPCOES[@]}"
apt-get install "${APT_OPCOES[@]}" ca-certificates curl git ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone America/Sao_Paulo

echo "== 2. Usuario deploy"
if ! id deploy >/dev/null 2>&1; then
  # useradd, e nao adduser: as opcoes do adduser mudam entre as versoes do Ubuntu.
  useradd --create-home --shell /bin/bash deploy
  usermod -aG sudo deploy
  echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy
fi
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi

echo "== 3. SSH so por chave"
[ -s /home/deploy/.ssh/authorized_keys ] || { echo "sem chave SSH no root: nao desligo a senha, para voce nao ficar trancado fora"; exit 1; }
cat > /etc/ssh/sshd_config.d/10-relatofacil.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
# Recarrega se o servico estiver de pe; se nao (entrada por soquete), reinicia.
sshd -t && { systemctl reload ssh 2>/dev/null || systemctl restart ssh; }
echo "entrada por senha: $(sshd -T | awk '/^passwordauthentication/ {print $2}')"

echo "== 4. Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

echo "== 5. Docker e Swarm"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker deploy
install -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl restart docker
if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != active ]; then
  # As portas do Swarm (2377, 7946, 4789) ficam fechadas no firewall: com um no so, nada
  # de fora precisa delas.
  ip_publico=$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}')
  docker swarm init --advertise-addr "$ip_publico"
fi

echo "== 6. Swap e limites"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' > /etc/sysctl.d/90-relatofacil.conf

echo
echo "Pronto. Proximos passos (deploy/README.md):"
echo "  1. entrar como deploy: ssh deploy@<ip>"
echo "  2. clonar o repositorio em /home/deploy/relatofacil"
echo "  3. criar deploy/.env.producao e rodar deploy/scripts/implantar.sh"
