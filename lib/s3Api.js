const path=require("path");
const logger = require("./loggers-winston").localdev(
    "info",
    path.basename(__filename)
  );
const fs = require("fs");
const { execSync } = require("child_process");
const lookup = require("mime-types").lookup;

const S3 = require("aws-sdk/clients/s3");
const awsS3Client = new S3({
  apiVersion: "2006-03-01",
  region: 'us-east-1'
});

module.exports.deleteObjects = par => {
  return new Promise((resolve, reject) => {
    try {
      const cmd =
        "aws s3 rm s3://" + par.BucketName + " " + par.DeleteS3Objects;
      logger.info("Executing deletsS3Objects command: %s", cmd);
      execSync(cmd, { shell: "/bin/bash", stdio: [0, 1, 2] }); 
      resolve("Success deleting objects");
    } catch (err) {
      reject(err);
    }
  });
};


module.exports.uploadObjects = par => {
  return new Promise((resolve, reject) => {
    awsS3Client.config.update.region = par.BucketRegion;
    logger.debug("uploadObjects.par: %s",JSON.stringify(par));
    getFileList(par.BuildDirPath, function(err, data) {
      if (err) {
        reject(err);
      } else {
        logger.info("uploadObjects.data.length: Sum of files and folders is %s",data.length);
        resolve(uploadLocalWebsiteFilesToS3(par,data));
      }
    });
  });
};

const uploadLocalWebsiteFilesToS3 = (par, data) => {
  data.forEach(function(aPath) {
    const stats = fs.lstatSync(aPath);
    if (stats.isFile()) {
      const filekey = aPath.substring(par.BuildDirPath.length);
      if (!par.Exclude(filekey)) {
        // excluding certain files and folders from upload
        const params = {
          ACL: "public-read",
          Bucket: par.BucketName,
          CacheControl: par.CacheControlLong,
          Key: par.S3KeyPrefix + filekey,
          Body: fs.readFileSync(aPath),
          ContentType: lookup(filekey) || "application/octet-stream"
        };
        if (
          filekey.endsWith(par.CacheControlShortTarget) ||
          filekey.endsWith(par.ServiceWorkerFileName)
        ) {
          params.CacheControl = par.CacheControlShort;
        }
        return uploadObjecttoS3(params);
      }
    }
  });
};

const uploadObjecttoS3= params => {
  logger.debug("uploadObjectstoS3.params: %s",params);
  return awsS3Client.upload(params).promise();
}

const getFileList = (dir, cb)=> {
  let fileList = [];

  fs.readdir(dir, function(err, data) {
    if (err) return cb(err);

    let length = data.length;
    logger.debug("getFileList.length: %s %s",length,data);
    if (!length) return cb(null, fileList);
    data.forEach(function(fileRPath) {
      const file = path.resolve(dir, fileRPath);

      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          fileList.push(file); 

          getFileList(file, function(err, res) {
            fileList = fileList.concat(res);
            if (!--length) cb(null, fileList);
          });
        } else {
          fileList.push(file);

          if (!--length) cb(null, fileList);
        }
      });
    });
  });
}
