#!/usr/bin/env node

(function() {
	'use strict';

	const
		DEFAULT_FOLDER_NAME = 'partkeepr-labels';

	const
		argv = require('yargs')
			.alias('i', 'input')
			.alias('o', 'output')
			.alias('p', 'part-number')
			.demand(['i'])
			.default('o', DEFAULT_FOLDER_NAME)
			.argv,
		fs = require('fs'),
		mkdirp = require('mkdirp'),
		child_process = require('child_process'),
		swig  = require('swig');

	let
		input,
		records = [];

	function readInput() {
		input = fs.readFileSync(argv.input);
	}

	function parseInput() {
		const
			STATE_START = 0,
			STATE_STRING = 1,
			STATE_QUOTED_STRING = 2,
			STATE_QUOTE_ESCAPE = 3;

		const
			separator = ',';

		let
			lines = input.toString().split('\n'),
			buffer,
			record,
			line,
			state = STATE_START;

		// I swear there are tons of libraries that
		// do fancy streamed/piped processing and
		// can process gigabytes of data using multiple
		// threads but I haven't found a single working
		// synchronous parser
		for (let i = 0; i < lines.length; i++) {
			line = lines[i];

			if (line.trim() === '') {
				continue;
			}

			record = [];
			buffer = '';
			state = STATE_START;

			for (let j = 0; j < line.length; j++) {
				switch (state) {
					case STATE_START:
						if (line[j] === separator) {
							record.push(buffer);
						} else if (line[j] === '"') {
							state = STATE_QUOTED_STRING;
						} else {
							state = STATE_STRING;
							buffer += line[j];
						}
						break;
					case STATE_STRING:
						if (line[j] === '"') {
							state = STATE_QUOTE_ESCAPE;
						} else if (line[j] === separator) {
							state = STATE_START;

							record.push(buffer);
							buffer = '';
						} else {
							buffer += line[j];
						}
						break;
					case STATE_QUOTE_ESCAPE:
						if (line[j] === '"') {
							buffer += '"';
							state = STATE_QUOTED_STRING;
						} else if (line[j] === separator) {
							state = STATE_START;

							record.push(buffer);
							buffer = '';
						}
						break;
					case STATE_QUOTED_STRING:
						if (line[j] === '"') {
							state = STATE_QUOTE_ESCAPE;
						} else {
							buffer += line[j];
						}
						break;
				}
			}

			record.push(buffer);
			records.push(record);
		}
	}

	function saveHTML() {
		let
			labels = [];
		const
			nameIndex = records[0].indexOf('name'),
			locationIndex = records[0].indexOf('storageLocation.name');

		for (let i = records.length - 1; i > 0; i--) {
			labels.push({
				partName: records[i][nameIndex],
				storageLocation: records[i][locationIndex],
				barcode: i + '.svg'
			});
		}

		const
			result = swig.renderFile('./templates/page.html', {
				labels: labels
			});

		mkdirp.sync(argv.output + '/images');
		fs.writeFileSync(argv.output + '/index.html', result);

		const
			escape = (str) => {
				return '"' + str
					.replace(/\\/g, '\\\\')
					.replace(/"/g, '\\"') + '"';
			};

		for (let i = records.length - 1; i > 0; i--) {
			let
				svg = child_process.execSync(
					'zint --notext --directsvg -d ' +
					escape(records[i][locationIndex])
				).toString();

			svg = svg.replace(
				'version="1.1"',
				'version="1.1" preserveAspectRatio="xMidYMid slice"'
			);

			fs.writeFileSync(argv.output + '/images/' + i + '.svg', svg);
		}
	}

	function main() {
		try {
			readInput();
			parseInput();
			saveHTML();
		} catch (e) {
			console.error('Error: ' + e.message);
		}
	}

	main();
})();
