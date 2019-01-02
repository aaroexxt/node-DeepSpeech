var FileWriter = require('wav').FileWriter;
var mic = require('mic'); // requires arecord or sox, see https://www.npmjs.com/package/mic
 
var micInstance = mic({
  rate: '16000',
  channels: '1',
  debug: true
});
 
var micInputStream = micInstance.getAudioStream();
 
var outputFileStream = new FileWriter('./test.wav', {
  sampleRate: 16000,
  channels: 1
});
 
micInputStream.pipe(outputFileStream);
 
micInstance.start();
 
setTimeout(function() {
  micInstance.stop();
}, 5000);