/*
	geltagger.js - Automated Gelbooru file tagger
	by Greg Smith

	Version 0.1.0
	Full source at https://github.com/smrq/geltagger
	Copyright (c) 2011 Greg Smith

	MIT License, https://github.com/smrq/geltagger/blob/master/LICENSE.md
	This file is generated by `cake build`, do not edit it by hand.
*/
(function() {
  var argv, async, exec, fs, gelbooruLookup, generateIPTCText, getData, imagemagickConvertPath, inputDirectory, interval, md5, mixin, outputDirectory, path, ratings, reject, restler, sys, tagDirectory, tagFile, timers, trim, watch, watchDirectory, writeTags;

  sys = require('sys');

  fs = require('fs');

  timers = require('timers');

  path = require('path');

  exec = require('child_process').exec;

  async = require('async');

  md5 = require('MD5');

  restler = require('restler');

  argv = require('optimist').usage('Usage: $0 -d [dir] -o [dir] -t [timeout]').options('d', {
    description: 'Select the directory to tag files in',
    alias: 'dir',
    demand: true
  }).options('o', {
    description: 'Select a directory to output tagged files into',
    alias: 'output',
    demand: true
  }).options('t', {
    demands: 'Request interval for the Gelbooru service',
    alias: 'interval',
    "default": 1000
  }).options('p', {
    description: 'Path to the imagemagick convert tool',
    alias: 'convert-path',
    "default": 'convert'
  }).options('w', {
    description: 'Watches the input directory for files',
    alias: 'watch'
  }).argv;

  mixin = function(target, source) {
    var key, _i, _len, _ref;
    if (source == null) source = {};
    _ref = Object.keys(source);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      target[key] = source[key];
    }
    return target;
  };

  reject = function(arr, pred) {
    var results, value, _i, _len;
    results = [];
    for (_i = 0, _len = arr.length; _i < _len; _i++) {
      value = arr[_i];
      if (!pred(value)) results.push(value);
    }
    return results;
  };

  trim = function(str) {
    return str.replace(/^\s+/, '').replace(/\s+$/, '');
  };

  inputDirectory = argv.d;

  outputDirectory = argv.o;

  interval = argv.t;

  imagemagickConvertPath = argv.p;

  watch = argv.w;

  ratings = {
    e: "explicit",
    q: "questionable",
    s: "safe"
  };

  gelbooruLookup = (function() {
    var queue;
    queue = [];
    timers.setInterval((function() {
      var callback, hash, url, _ref;
      if (queue.length > 0) {
        _ref = queue.shift(), hash = _ref.hash, callback = _ref.callback;
        url = "http://gelbooru.com/index.php?page=dapi&s=post&q=index&tags=md5:" + hash;
        console.log("Requesting md5:" + hash);
        return restler.get(url).on('complete', function(xml) {
          return (new xml2js.Parser()).parseString(xml, callback);
        });
      }
    }), interval);
    return function(hash, callback) {
      return queue.push({
        hash: hash,
        callback: callback
      });
    };
  })();

  writeTags = function(inFile, outFile, iptcText, cb) {
    var child, execCommand, iptcFile;
    iptcFile = "" + outFile + ".iptc";
    fs.writeFileSync(iptcFile, iptcText);
    execCommand = "\"" + imagemagickConvertPath + "\" +profile 8BIM -profile 8BIMTEXT:" + iptcFile + " " + inFile + " " + outFile;
    return child = exec(execCommand, function(err, stdout, stderr) {
      if (stdout) console.log("ImageMagick (" + inFile + "): " + stdout);
      if (stderr) console.error("ImageMagick (" + inFile + "): " + stderr);
      if (err) return cb(err);
      fs.unlinkSync(iptcFile);
      console.log("Tagged file written to " + outFile);
      return cb();
    });
  };

  generateIPTCText = function(tags, source) {
    var lines, tag, _i, _len;
    lines = ['8BIM#1028="IPTC"', '2#0="&#0;&#2;'];
    if (source != null) lines.push('2#110#Credit="' + source + '"');
    for (_i = 0, _len = tags.length; _i < _len; _i++) {
      tag = tags[_i];
      lines.push('2#25#Keyword="' + tag + '"');
    }
    return lines.join("\n");
  };

  getData = function(postData) {
    var source, tags, _ref, _ref2;
    if (postData == null) return null;
    if (postData['@'] == null) return null;
    if (postData['@'].count !== "1") return null;
    postData = (_ref = postData.post['@']) != null ? _ref : {};
    tags = (_ref2 = postData.tags) != null ? _ref2 : "";
    tags = reject(tags.split(" "), function(t) {
      return trim(t) === "";
    });
    if (postData.rating != null) tags.push("rating:" + ratings[postData.rating]);
    if (postData.id != null) tags.push("id:" + postData.id);
    if (postData.source) source = postData.source;
    return {
      tags: tags,
      source: source
    };
  };

  tagFile = function(filename, inDir, outDir, cb) {
    var inFile, outFile;
    inFile = path.join(inDir, filename);
    outFile = path.join(outDir, filename);
    return fs.readFile(inFile, function(err, fileContents) {
      var hash;
      if (err != null) return cb(err);
      hash = md5(fileContents);
      return gelbooruLookup(hash, function(err, postData) {
        var iptcText, parsedPostData, source, tags;
        if (err != null) return cb(err);
        parsedPostData = getData(postData);
        if (parsedPostData == null) {
          return cb("Invalid post data for file " + inFile + " with hash " + hash + "\n" + (sys.inspect(postData)));
        }
        tags = parsedPostData.tags, source = parsedPostData.source;
        iptcText = generateIPTCText(tags, source);
        return writeTags(inFile, outFile, iptcText, cb);
      });
    });
  };

  tagDirectory = function(inDir, outDir, cb) {
    return fs.readdir(inDir, function(err, files) {
      var errors;
      if (err != null) return cb(err);
      errors = null;
      return async.forEach(files, (function(filename, cb) {
        console.log("Tagging file: " + filename);
        return tagFile(filename, inDir, outDir, cb);
      }), cb);
    });
  };

  watchDirectory = (function() {
    var changedFiles;
    changedFiles = {};
    return function(inDir, outDir, cb) {
      return fs.watch(inDir, function(event, inFile) {
        if (inFile != null) {
          changedFiles[{
            inFile: inFile,
            inDir: inDir,
            outDir: outDir,
            cb: cb
          }] = true;
          return timers.setTimeout((function() {
            if (changedFiles[{
              inFile: inFile,
              inDir: inDir,
              outDir: outDir,
              cb: cb
            }]) {
              delete changedFiles[{
                inFile: inFile,
                inDir: inDir,
                outDir: outDir,
                cb: cb
              }];
              console.log("Found file: " + inFile);
              return tagFile(inFile, inDir, outDir, cb);
            }
          }), 100);
        }
      });
    };
  })();

  if (watch) {
    watchDirectory(inputDirectory, outputDirectory, function(err) {
      if (err != null) return console.error("" + err);
    });
  } else {
    tagDirectory(inputDirectory, outputDirectory, function(err) {
      if (err != null) {
        console.error("" + err);
        return process.exit(1);
      } else {
        console.log("Process completed successfully.");
        return process.exit(0);
      }
    });
  }

}).call(this);
