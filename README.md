# geltagger.js
geltagger.js is an automated Gelbooru tagging app written with Node.js, using ImageMagick for image file manipulation.

## Usage
node geltagger.js -d `input directory` -o `output directory` `options...`

## Options
### Input directory (-d, --dir)
Specify the input directory for untagged images.

### Output directory (-o, --output)
Specify the output directory for tagged images.

### Request interval (-t, --interval)
Specify the interval between requests to the Gelbooru API.  Defaults to `1000` (1 second).

### ImageMagick path (-p, --convert-path)
Specify the path to the ImageMagick `convert` tool.

### Watch (-w, --watch)
Add this option to watch the input directory for new files instead of running through the file list once.

### Delete source (-x, --delete-source)
Add this option to delete the original source file after successfully tagging.