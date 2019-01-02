#!/usr/bin/env node

const Fs = require('fs');
const mic = require('mic');
const Sox = require('sox-stream');
const Ds = require('deepspeech');
const argparse = require('argparse');
const MemoryStream = require('memory-stream');
const Wav = require('node-wav');
const util = require('util');


const AUDIO_LENGTH_MS = 10000; //length of audio to record

// These constants control the beam search decoder

// Beam width used in the CTC decoder when building candidate transcriptions
const BEAM_WIDTH = 500;

// The alpha hyperparameter of the CTC decoder. Language Model weight
const LM_WEIGHT = 1.50;

// Valid word insertion weight. This is used to lessen the word insertion penalty
// when the inserted word is part of the vocabulary
const VALID_WORD_COUNT_WEIGHT = 2.10;


// These constants are tied to the shape of the graph used (changing them changes
// the geometry of the first layer), so make sure you use the same constants that
// were used during training

// Number of MFCC features to use
const N_FEATURES = 26;

// Size of the context window used for producing timesteps in the input vector
const N_CONTEXT = 9;

var VersionAction = function VersionAction(options) {
  options = options || {};
  options.nargs = 0;
  argparse.Action.call(this, options);
}
util.inherits(VersionAction, argparse.Action);

VersionAction.prototype.call = function(parser) {
  Ds.printVersions();
  process.exit(0);
}

var parser = new argparse.ArgumentParser({addHelp: true, description: 'Running DeepSpeech inference.'});
parser.addArgument(['--model'], {required: true, help: 'Path to the model (protocol buffer binary file)'});
parser.addArgument(['--alphabet'], {required: true, help: 'Path to the configuration file specifying the alphabet used by the network'});
parser.addArgument(['--lm'], {help: 'Path to the language model binary file', nargs: '?'});
parser.addArgument(['--trie'], {help: 'Path to the language model trie file created with native_client/generate_trie', nargs: '?'});
parser.addArgument(['--version'], {action: VersionAction, help: 'Print version and exits'})
var args = parser.parseArgs();

function totalTime(hrtimeValue) {
  return (hrtimeValue[0] + hrtimeValue[1] / 1000000000).toPrecision(4);
}

function bufferToStream(buffer) {
  var stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

var micInstance = mic({
    sampleRate: 16000,
    channels: 1,
    debug: true,
    fileType: "wav",
    bits: 16,
    encoding: 'signed-integer',
    endian: 'little',
    compression: 0.0
    //exitOnSilence: 6
});
var micInputStream = micInstance.getAudioStream();
var audioStream = new MemoryStream();

var transform = Sox({
    global: {
      'no-dither': true,
    },
    output: {
      bits: 16,
      rate: 16000,
      channels: 1,
      encoding: 'signed-integer',
      endian: 'little',
      compression: 0.0,
      type: 'raw'
    }
  })

micInputStream.pipe(transform).pipe(audioStream);

micInstance.start();

setTimeout( () => {
  micInstance.stop();

},AUDIO_LENGTH_MS);


audioStream.on('finish', () => {
  console.log("Recording finished; processing audio")
});
audioStream.on('finish', () => {
  audioBuffer = audioStream.toBuffer();

  console.error('Loading model from file %s', args['model']);
  const model_load_start = process.hrtime();
  var model = new Ds.Model(args['model'], N_FEATURES, N_CONTEXT, args['alphabet'], BEAM_WIDTH);
  const model_load_end = process.hrtime(model_load_start);
  console.error('Loaded model in %ds.', totalTime(model_load_end));

  if (args['lm'] && args['trie']) {
    console.error('Loading language model from files %s %s', args['lm'], args['trie']);
    const lm_load_start = process.hrtime();
    model.enableDecoderWithLM(args['alphabet'], args['lm'], args['trie'],
                              LM_WEIGHT, VALID_WORD_COUNT_WEIGHT);
    const lm_load_end = process.hrtime(lm_load_start);
    console.error('Loaded language model in %ds.', totalTime(lm_load_end));
  }

  const inference_start = process.hrtime();
  console.error('Running inference.');
  const audioLength = (audioBuffer.length / 2) * ( 1 / 16000);

  // We take half of the buffer_size because buffer is a char* while
  // LocalDsSTT() expected a short*
  console.log(model.stt(audioBuffer.slice(0, audioBuffer.length / 2), 16000));
  const inference_stop = process.hrtime(inference_start);
  console.error('Inference took %ds for %ds audio file.', totalTime(inference_stop), audioLength.toPrecision(4));
});
