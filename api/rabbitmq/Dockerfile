# RabbitMQ com o plugin de mensagem atrasada.
#
# **O plugin nao vem no RabbitMQ base**, e e ele que sustenta a espera antes de
# quem relatou ver: sem o `x-delayed-message`, a troca nao declara e a aplicacao
# descobre isso na subida — que e onde se quer descobrir, e nao no primeiro
# movimento de um relato de verdade.
#
# A versao do plugin acompanha a do servidor: sao compilados para a mesma linha do
# Erlang, e um par trocado falha ao habilitar.
FROM rabbitmq:3.13-management

ARG PLUGIN_VERSION=3.13.0

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fsSL -o /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange.ez \
      "https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v${PLUGIN_VERSION}/rabbitmq_delayed_message_exchange-${PLUGIN_VERSION}.ez"; \
    rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*
