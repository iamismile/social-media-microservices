const amqplib = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "social_events";

async function connectToRabbitMQ() {
  try {
    connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });
    logger.info("Connected to RabbitMQ and exchange asserted");

    return channel;
  } catch (err) {
    logger.error("Failed to connect to RabbitMQ", err);
  }
}

async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  const q = await channel.assertQueue("", { exclusive: true });
  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);

  channel.consume(q.queue, (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      callback(content);
      channel.ack(msg);
      logger.info(`Event received from RabbitMQ: ${routingKey}`, content);
    }
  });

  logger.info("Subscribed to RabbitMQ events with routing key:", {
    routingKey,
  });
}

module.exports = { connectToRabbitMQ, consumeEvent };
