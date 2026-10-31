# RabbitMQ com o plugin de mensagem atrasada.
#
# **O plugin nao vem no RabbitMQ base**, e e ele que sustenta a espera antes de
# quem relatou ver: sem o `x-delayed-message`, a troca nao declara e a aplicacao
# descobre isso na subida — que e onde se quer descobrir, e nao no primeiro
# movimento de um relato de verdade.
#
# A versao do plugin acompanha a do servidor: sao compilados para a mesma linha do
# Erlang, e um par trocado falha ao habilitar.
FROM rabbitmq:4.2-management

ARG PLUGIN_VERSION=4.2.0
# O sha256 do arquivo da versao acima, tirado do download oficial em 31/10 (o GitHub nao
# publica um). Se o arquivo mudar la, a montagem para, em vez de levar o que veio.
ARG PLUGIN_SHA256=f168b2c09810cde3726961d31f38e3408e6a7fbff3929908d6f962061d8e70a1

# O sistema da imagem atualizado antes de tudo: as correcoes do OpenSSL e do GnuPG chegam
# antes de a imagem oficial ser republicada (em 30/10, a 3.13 tinha cinco falhas altas assim).
RUN set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fsSL -o /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange.ez \
      "https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v${PLUGIN_VERSION}/rabbitmq_delayed_message_exchange-${PLUGIN_VERSION}.ez"; \
    echo "${PLUGIN_SHA256}  /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange.ez" | sha256sum -c -; \
    rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*
