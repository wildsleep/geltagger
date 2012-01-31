sys   	= require 'sys'
fs    	= require 'fs'
timers	= require 'timers'
path  	= require 'path'
{exec}	= require 'child_process'

async  	= require 'async'
md5    	= require 'MD5'
restler	= require 'restler'

argv = require('optimist').
	usage(
		'Usage: $0 -d [dir] -o [dir] -t [timeout]'
	).options('d',
		description: 'Select the directory to tag files in'
		alias: 'dir'
		demand: true
	).options('o',
		description: 'Select a directory to output tagged files into'
		alias: 'output'
		demand: true
	).options('t',
		demands: 'Request interval for the Gelbooru service'
		alias: 'interval'
		default: 1000
	).options('p',
		description: 'Path to the imagemagick convert tool'
		alias: 'convert-path'
		default: 'convert'
	).options('w',
		description: 'Watches the input directory for files'
		alias: 'watch'
	).argv

# Utilities

mixin = (target, source) ->
	source ?= {}
	target[key] = source[key] for key in Object.keys(source)
	return target

reject = (arr, pred) ->
	results = []
	(results.push(value) unless pred(value)) for value in arr
	return results

trim = (str) ->
	str.replace(/^\s+/, '').replace(/\s+$/, '')

# Options

inputDirectory = argv.d
outputDirectory = argv.o
interval = argv.t
imagemagickConvertPath = argv.p
watch = argv.w

# Constants

ratings =
	e: "explicit"
	q: "questionable"
	s: "safe"

# Gelbooru REST service

gelbooruLookup = do ->
	queue = []
	timers.setInterval (->
		if queue.length > 0
			{hash, callback} = queue.shift()
			url = "http://gelbooru.com/index.php?page=dapi&s=post&q=index&tags=md5:#{hash}"
			console.log "Requesting md5:#{hash}"
			restler.get(url).on('complete', (xml) ->
				(new xml2js.Parser()).parseString(xml, callback)
			)
	), interval

	return (hash, callback) ->
		queue.push {hash, callback}

# ImageMagick convert

writeTags = (inFile, outFile, iptcText, cb) ->
	# Create temp file for IPTC data
	iptcFile = "#{outFile}.iptc"
	fs.writeFileSync(iptcFile, iptcText)

	execCommand = "\"#{imagemagickConvertPath}\" +profile 8BIM -profile 8BIMTEXT:#{iptcFile} #{inFile} #{outFile}"
	child = exec execCommand,
		(err, stdout, stderr) ->
			console.log "ImageMagick (#{inFile}): #{stdout}" if stdout
			console.error "ImageMagick (#{inFile}): #{stderr}" if stderr
			return cb(err) if err

			# Delete temp file
			fs.unlinkSync iptcFile

			console.log "Tagged file written to #{outFile}"

			return cb()

# Methods


generateIPTCText = (tags, source) ->
	lines = [
		'8BIM#1028="IPTC"'
		'2#0="&#0;&#2;'
	]
	#(lines.push('8BIM#1071="' + source + '"')) if source?
	(lines.push('2#110#Credit="' + source + '"')) if source?
	(lines.push('2#25#Keyword="' + tag + '"')) for tag in tags
	return lines.join("\n")


getData = (postData) ->
	return null unless postData?
	return null unless postData['@']?
	return null unless postData['@'].count is "1"

	postData = postData.post['@'] ? {}

	tags = postData.tags ? ""
	tags = reject(tags.split(" "), (t) -> trim(t) is "")

	tags.push("rating:#{ratings[postData.rating]}") if postData.rating?
	tags.push("id:#{postData.id}") if postData.id?

	source = postData.source if postData.source

	return {tags, source}

tagFile = (filename, inDir, outDir, cb) ->
	inFile = path.join(inDir, filename)
	outFile = path.join(outDir, filename)
	fs.readFile inFile, (err, fileContents) ->
		return cb(err) if err?
		hash = md5(fileContents)
		gelbooruLookup hash, (err, postData) ->
			return cb(err) if err?

			parsedPostData = getData(postData)
			return cb("Invalid post data for file #{inFile} with hash #{hash}\n#{sys.inspect postData}") unless parsedPostData?

			{tags, source} = parsedPostData
			iptcText = generateIPTCText(tags, source)
			writeTags inFile, outFile, iptcText, cb


tagDirectory = (inDir, outDir, cb) ->
	fs.readdir inDir, (err, files) ->
		return cb(err) if err?
		errors = null
		async.forEach files, ((filename, cb) ->
			console.log "Tagging file: #{filename}"
			tagFile(filename, inDir, outDir, cb)
		), cb

watchDirectory = do ->
	changedFiles = {}
	return (inDir, outDir, cb) ->
		fs.watch inDir, (event, inFile) ->
			if inFile?
				changedFiles[{inFile, inDir, outDir, cb}] = true

				# Hack to deal with Windows getting multiple watch notifications on file change
				timers.setTimeout (->
					if changedFiles[{inFile, inDir, outDir, cb}]
						delete changedFiles[{inFile, inDir, outDir, cb}]

						console.log "Found file: #{inFile}"
						tagFile inFile, inDir, outDir, cb

				), 100


# Run the process

if watch then watchDirectory inputDirectory, outputDirectory, (err) ->
	console.error "#{err}" if err?
else tagDirectory inputDirectory, outputDirectory, (err) ->
	if err?
		console.error "#{err}"
		process.exit 1
	else
		console.log "Process completed successfully."
		process.exit 0