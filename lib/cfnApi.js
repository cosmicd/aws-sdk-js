const path = require("path");
const logger = require("./loggers-winston").localdev(
  "info",
  path.basename(__filename)
);
const client = require("aws-sdk/clients/cloudformation");
const cfn = new client({
  apiVersion: "2010-05-15",
  region: "us-east-1"
});

const sleepSeconds = sec => {
  return new Promise(resolve => setTimeout(resolve, 1000 * sec));
};

const stackStatusPoll = async (sec, statusList, stack) => {
  let res = await module.exports.describeStacks(stack);
  logger.debug("poll: ", res);
  let status = res.Stacks[0].StackStatus;
  while (statusList.includes(status)) {
    // if still not done
    await sleepSeconds(sec);
    res = await module.exports.describeStacks(stack);
    status = res.Stacks[0].StackStatus;
  }
  return res;
};

const exitOnFailure = (statusList, res) => {
  const status = res.Stacks[0].StackStatus;
  if (!statusList.includes(status)) {
    logger.error("stackStatusReason: %s", res.Stacks[0].StackStatusReason);
    logger.info("Task failed, exiting...");
    process.exit(1);
  }
};

module.exports.validateTemplate = async stack => {
  cfn.config.update.region = stack.region;
  const params = {};
  if (stack.params.TemplateBody) {
    params.TemplateBody = stack.params.TemplateBody;
  } else {
    params.TemplateURL = stack.params.TemplateURL;
  }
  try {
    await cfn.validateTemplate(params).promise();
  } catch (err) {
    logger.error(err);
    logger.info("Task failed, exiting...");
    process.exit(1); // exit if template has error
  }
};

module.exports.createChangeSet = async stack => {
  cfn.config.update.region = stack.region;
  try {
    await cfn.createChangeSet(stack.params).promise();
    await sleepSeconds(4);
    const statusList = ["CREATE_IN_PROGRESS"];
    const res = await stackStatusPoll(5, statusList, stack);
    const successCode = ["REVIEW_IN_PROGRESS"];
    exitOnFailure(successCode, res);
  } catch (err) {
    logger.error(err.message);
    logger.info("Task failed, exiting...");
    process.exit(1);
  }
};

module.exports.executeChangeSet = async stack => {
  cfn.config.update.region = stack.region;
  const params = {
    StackName: stack.params.StackName,
    ChangeSetName: stack.params.ChangeSetName
  };
  try {
    await cfn.executeChangeSet(params).promise();
    await sleepSeconds(4); // give a break
    const statusList = ["CREATE_IN_PROGRESS", "ROLLBACK_IN_PROGRESS"];
    const res = await stackStatusPoll(30, statusList, stack);
    const successCode = ["CREATE_COMPLETE"];
    exitOnFailure(successCode, res);
  } catch (err) {
    logger.error(err.message);
    logger.info("Task failed, exiting...");
    process.exit(1);
  }
};
module.exports.describeStacks = stack => {
  // promise example without async-await
  // Works for change sets that have not been executed yet.
  cfn.config.update.region = stack.region;
  const params = {
    StackName: stack.params.StackName
  };
  return cfn.describeStacks(params).promise();
};

module.exports.deleteStack = async stack => {
  let res = {};
  try {
    res = await module.exports.describeStacks(stack);
    if (res.Stacks[0].StackStatus !== "DELETE_COMPLETE") {
      stack.params.StackName = res.Stacks[0].StackId;
      cfn.config.update.region = stack.region;
      const params = {
        StackName: stack.params.StackName
      };
      logger.debug("stack: %s", JSON.stringify(params));
      res = await cfn.deleteStack(params).promise();
      await sleepSeconds(2);
      const statusList = ["DELETE_IN_PROGRESS"];
      res = await stackStatusPoll(5, statusList, stack);
      logger.debug(res);
      const successCode = ["DELETE_COMPLETE"];
      exitOnFailure(successCode, res); // if delete fails, process.exit(1).
    } else {
      logger.info("stack has a DELETE_COMPLETE status.");
    }
  } catch (err) {
    logger.error(err.message);
    logger.info("Task failed, exiting...");
    process.exit(1);
  }
};

module.exports.describeChangeSet = stack => {
  //example using callback
  // Works for change sets that have not been executed yet.
  cfn.config.update.region = stack.region;
  const params = {
    StackName: stack.params.StackName,
    ChangeSetName: stack.params.ChangeSetName
  };
  cfn.describeChangeSet(params, function(err, data) {
    if (err) console.log(err, err.stack);
    else console.log(data);
  });
};

module.exports.listChangeSets = stack => {
  //example using callback
  cfn.config.update.region = stack.region;
  const params = {
    StackName: stack.params.StackName
  };
  cfn.listChangeSets(params, function(err, data) {
    if (err) console.log(err, err.stack);
    else console.log(data.Summaries);
  });
};

module.exports.deleteChangeSet = stack => {
  //example using callback
  // Will delete the change set that has not been executed
  cfn.config.update.region = stack.region;
  const params = {
    ChangeSetName: stack.params.ChangeSetName /* required */,
    StackName: stack.params.StackName
  };
  cfn.deleteChangeSet(params, function(err, data) {
    if (err) console.log(err, err.stack);
    else console.log("done");
  });
};

module.exports.listStacks = stack => {
  cfn.config.update.region = stack.region;
  const params = {
    // expects a list
    StackStatusFilter: stack.StackStatusFilter
  };
  return cfn.listStacks(params).promise();
};

module.exports.estimateTemplateCost = stack => {
  //example using callback
  // USELESS! Just returns a link to the aws cost calculator
  cfn.config.update.region = stack.region;
  const params = {};
  if (stack.params.TemplateBody) {
    params.TemplateBody = stack.params.TemplateBody;
  } else {
    params.TemplateURL = stack.params.TemplateURL;
  }
  cfn.estimateTemplateCost(params, function(err, data) {
    if (err) console.log(err, err.stack);
    else console.log(data);
  });
};
