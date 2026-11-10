// Reviewed against Relay's merged source; examples remain tied to this revision.
export const RELAY_LAB_REVISION = 'b7ae15ea68ac5ac015851ad14b751bada2a1677a';
const repository = 'https://github.com/pustka-sh/Relay';
const source = (label, path, line) => ({label,path,line,href:`${repository}/blob/${RELAY_LAB_REVISION}/${path}#L${line}`});

export const LAB_SOURCES = {
  handshake:source('Handshake encoding','proxy/src/main/java/dev/relay/protocol/packet/HandshakePacket.java',75),
  version:source('Supported protocol versions','proxy/src/main/java/dev/relay/protocol/ProtocolVersion.java',23),
  intent:source('Status and login branching','proxy/src/main/java/dev/relay/session/HandshakeSessionHandler.java',28),
  identity:source('Client login and authentication','proxy/src/main/java/dev/relay/session/LoginSessionHandler.java',72),
  routing:source('Candidate selection and retries','proxy/src/main/java/dev/relay/session/BackendConnector.java',64),
  forwarding:source('Backend login and forwarding','proxy/src/main/java/dev/relay/session/BackendLoginSessionHandler.java',60),
  modern:source('Modern profile signing','proxy/src/main/java/dev/relay/forwarding/ModernForwarding.java',76),
  legacy:source('Legacy hostname forwarding','proxy/src/main/java/dev/relay/forwarding/LegacyForwarding.java',36),
};

export const LAB_VERSIONS = [
  {protocol:764,label:'1.20.2'},
  {protocol:765,label:'1.20.3 / 1.20.4'},
  {protocol:766,label:'1.20.5 / 1.20.6'},
  {protocol:767,label:'1.21 / 1.21.1'},
  {protocol:768,label:'1.21.2 / 1.21.3'},
  {protocol:769,label:'1.21.4'},
  {protocol:770,label:'1.21.5'},
  {protocol:771,label:'1.21.6'},
  {protocol:772,label:'1.21.7 / 1.21.8'},
];

export const LAB_SCENARIOS = [
  {id:'healthy',label:'Normal join',hint:'Both sample backends accept connections.'},
  {id:'fallback',label:'First backend down',hint:'Lobby is unreachable; survival is available.'},
  {id:'mismatch',label:'Forwarding mismatch',hint:'Both sample backends require modern forwarding with a different secret.'},
  {id:'unavailable',label:'No backends available',hint:'Neither sample backend accepts a connection.'},
];

export const LAB_DEFAULTS = Object.freeze({protocol:769,intent:'login',authentication:'online',forwarding:'modern',scenario:'healthy'});
export const LAB_SAMPLE = Object.freeze({hostname:'play.example.com',port:25565,player:'Explorer',proxy:'relay-01',candidates:['lobby','survival']});
