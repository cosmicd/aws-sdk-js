const { createLogger, format, transports } = require("winston");

const customFormat = format.printf(mess => {
  return ` [${mess.label}] ${mess.level}: ${mess.message}`;
});
const localdev = (level, messageLabel) => {
  return createLogger({
    format: format.combine(
      format.colorize(),
      format.label({ label: messageLabel }),
      format.prettyPrint(),
      format.splat(),
      customFormat
      //     format.simple()
    ),
    transports: [
      new transports.Console({ level: level, colorize: true }),
      new transports.File({ filename: "localdev_error.log", level: "error" })
    ]
  });
};

module.exports = {
  localdev
};
