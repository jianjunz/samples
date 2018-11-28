/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let textEncoder;
let textDecoder;
const dataChannelSend = document.querySelector('textarea#dataChannelSend');
const dataChannelReceive = document.querySelector('textarea#dataChannelReceive');
const startButton = document.querySelector('button#startButton');
const sendButton = document.querySelector('button#sendButton');
const closeButton = document.querySelector('button#closeButton');

startButton.onclick = createConnection;
sendButton.onclick = sendData;
closeButton.onclick = closeDataChannels;

function enableStartButton() {
  startButton.disabled = false;
}

function disableSendButton() {
  sendButton.disabled = true;
}

function generateCertificate() {
  return RTCPeerConnection.generateCertificate({
    name: 'ECDSA',
    namedCurve: 'P-256'
  });
}

function createConnection() {
  dataChannelSend.placeholder = '';
  const servers = null;
  textEncoder = new TextEncoder();
  textDecoder = new TextDecoder();

  window.localIceTransport = new RTCIceTransport();
  console.log('Created local ICE transport object localIceTransport');

  window.remoteIceTransport = new RTCIceTransport();
  console.log('Created remote ICE transport object remoteIceTransport');

  localIceTransport.onicecandidate = e => {
    onIceCandidate(localIceTransport, e);
  };
  remoteIceTransport.onicecandidate = e => {
    onIceCandidate(remoteIceTransport, e);
  };

  localIceTransport.gather({});
  remoteIceTransport.gather({});
  console.log('Gather ICE candidates.');

  localIceTransport.start(remoteIceTransport.getLocalParameters(), 'controlling');
  remoteIceTransport.start(localIceTransport.getLocalParameters(), 'controlled');
  console.log('Start ICE transport.');

  Promise.all([generateCertificate(), generateCertificate()]).then(([localCertificate, remoteCertificate]) => {
    window.localCertificate = localCertificate;
    window.remoteCertificate = remoteCertificate;
    console.log('Generated local and remote certificate localCertificate and remoteCertificate.');

    window.localQuicTransport = new RTCQuicTransport(localIceTransport, [localCertificate]);
    console.log('Created local QUIC transport localQuicTransport.');
    window.remoteQuicTransport = new RTCQuicTransport(remoteIceTransport, [remoteCertificate]);
    console.log('Created remote QUIC transport remoteQuicTransport.');
  
    localQuicTransport.onstatechange = () => {
      onLocalQuicTransportStateChange();
    }

    localQuicTransport.start(remoteQuicTransport.getLocalParameters());
    remoteQuicTransport.start(localQuicTransport.getLocalParameters());
    console.log('Start Quic transport.');
  
    startButton.disabled = true;
    closeButton.disabled = false;  
  });
}

function onCreateSessionDescriptionError(error) {
  console.log('Failed to create session description: ' + error.toString());
}

function sendData() {
  const data = dataChannelSend.value; 
  const encodedData=textEncoder.encode(data);
  localQuicStream.write(new Uint8Array([encodedData.length]));
  localQuicStream.write(encodedData);
  console.log('Sent Data: ' + data);
}

function closeDataChannels() {
  console.log('Closing data channels');
  sendChannel.close();
  console.log('Closed data channel with label: ' + sendChannel.label);
  receiveChannel.close();
  console.log('Closed data channel with label: ' + receiveChannel.label);
  localConnection.close();
  remoteConnection.close();
  localConnection = null;
  remoteConnection = null;
  console.log('Closed peer connections');
  startButton.disabled = false;
  sendButton.disabled = true;
  closeButton.disabled = true;
  dataChannelSend.value = '';
  dataChannelReceive.value = '';
  dataChannelSend.disabled = true;
  disableSendButton();
  enableStartButton();
}

function gotDescription1(desc) {
  localConnection.setLocalDescription(desc);
  console.log(`Offer from localConnection\n${desc.sdp}`);
  remoteConnection.setRemoteDescription(desc);
  remoteConnection.createAnswer().then(
    gotDescription2,
    onCreateSessionDescriptionError
  );
}

function gotDescription2(desc) {
  remoteConnection.setLocalDescription(desc);
  console.log(`Answer from remoteConnection\n${desc.sdp}`);
  localConnection.setRemoteDescription(desc);
}

function getOtherIceTransport(iceTransport) {
  return (iceTransport === localIceTransport) ? remoteIceTransport : localIceTransport;
}

function getName(iceTransport) {
  return (iceTransport === localIceTransport) ? 'localIceTransport' : 'remoteIceTransport';
}

function onIceCandidate(iceTransport, event) {
  if (event.candidate) {
    getOtherIceTransport(iceTransport).addRemoteCandidate(event.candidate);
    console.log(`${getName(iceTransport)} ICE candidate: ${event.candidate ? event.candidate.candidate : '(null)'}`);
  }
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;
}

function waitForData(stream){
  stream.waitForReadable(1).then(()=>{
    const lengthBuffer = new Uint8Array(1);
    stream.readInto(lengthBuffer);
    stream.waitForReadable(lengthBuffer[0]).then(()=>{
      const dataBuffer=new Uint8Array(lengthBuffer[0]);
      stream.readInto(dataBuffer);
      dataChannelReceive.value = textDecoder.decode(dataBuffer);
      waitForData(window.remoteQuicStream);
    });
  })
}

function onReceiveMessageCallback(event) {
  console.log('Received Message');
  dataChannelReceive.value = event.data;
}

function onLocalQuicTransportStateChange() {
  const state = localQuicTransport.state;
  console.log('Send channel state is: ' + state);
  if (state === 'connected') {
    window.localQuicStream = localQuicTransport.createStream();
    console.log('Create local QUIC stream localQuicStream.');
    remoteQuicTransport.addEventListener('quicstream',(event)=>{
      window.remoteQuicStream=event.stream;
      console.log('Create remote QUIC stream remoteQuicStream.');
      waitForData(event.stream);
    });
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    sendButton.disabled = false;
    closeButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
    closeButton.disabled = true;
  }
}

function onReceiveChannelStateChange() {
  const readyState = receiveChannel.readyState;
  console.log(`Receive channel state is: ${readyState}`);
}
