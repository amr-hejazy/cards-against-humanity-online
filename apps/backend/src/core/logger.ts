import winston from "winston";

import env, { isDev } from "../env";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  return isDev ? "debug" : "warn";
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "blue",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

const fileFormat = winston.format.combine(baseFormat, winston.format.json());

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level} ${info.message}`,
      ),
      winston.format.colorize({ all: true }),
    ),
  }),
  new winston.transports.File({
    filename: `${env.LOGS_PATH}/error.log`,
    level: "error",
    format: fileFormat,
  }),
  new winston.transports.File({
    filename: `${env.LOGS_PATH}/all.log`,
    format: fileFormat,
  }),
];

const logger = winston.createLogger({
  level: level(),
  levels,
  format: baseFormat,
  transports,
});

export default logger;
