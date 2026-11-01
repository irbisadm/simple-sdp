// The session description model: a field-for-field port of src/interfaces/Sdp.ts.
// Optional strings and objects are nullable, optional numbers are NaN when absent,
// optional flags are false when absent, records are `Params`.

import {ABSENT, Params} from './util';

export class GenericAttribute {
  constructor(public name: string, public value: string | null) {}
}

export class Fingerprint {
  constructor(public hashFunction: string, public fingerprint: string) {}
}

export class Extmap {
  id: f64 = ABSENT;
  direction: string | null = null;
  uri: string = '';
  attributes: string | null = null;
}

export class Candidate {
  foundation: string = '';
  component: f64 = ABSENT;
  transport: string = '';
  priority: f64 = ABSENT;
  address: string = '';
  port: f64 = ABSENT;
  type: string = '';
  relatedAddress: string | null = null;
  relatedPort: f64 = ABSENT;
  tcpType: string | null = null;
  extensions: Params | null = null;
}

export class Ssrc {
  constructor(public id: f64, public attributes: Params) {}
}

export class SsrcGroup {
  constructor(public semantics: string, public ssrcs: f64[]) {}
}

export class Msid {
  constructor(public streamId: string, public trackId: string | null) {}
}

export class Rid {
  id: string = '';
  direction: string = '';
  payloadTypes: f64[] | null = null;
  restrictions: Params | null = null;
}

export class SimulcastRid {
  constructor(public rid: string, public paused: bool) {}
}

export class Simulcast {
  send: Array<Array<SimulcastRid>> | null = null;
  recv: Array<Array<SimulcastRid>> | null = null;
}

export class Rtcp {
  port: f64 = ABSENT;
  netType: string | null = null;
  addrType: string | null = null;
  address: string | null = null;
}

export class CommonAttributes {
  direction: string | null = null;
  iceUfrag: string | null = null;
  icePwd: string | null = null;
  iceOptions: string[] | null = null;
  endOfCandidates: bool = false;
  fingerprints: Fingerprint[] | null = null;
  setup: string | null = null;
  extmap: Extmap[] | null = null;
  extmapAllowMixed: bool = false;
  attributes: GenericAttribute[] | null = null;
}

export class Origin {
  username: string = '';
  sessId: string = '';
  sessVersion: string = '';
  netType: string = '';
  addrType: string = '';
  unicastAddress: string = '';
}

export class RepeatTimes {
  repeatInterval: f64 = ABSENT;
  activeDuration: f64 = ABSENT;
  offsets: f64[] = [];
}

export class TimeZoneAdjustment {
  constructor(public adjustmentTime: f64, public offset: f64) {}
}

export class Timing {
  startTime: f64 = ABSENT;
  stopTime: f64 = ABSENT;
  repeat: RepeatTimes[] | null = null;
  zoneAdjustments: TimeZoneAdjustment[] | null = null;
}

export class EncryptionKey {
  constructor(public method: string, public encryptionKey: string | null) {}
}

export class Bandwidth {
  constructor(public bwtype: string, public bandwidth: f64) {}
}

export class Connection {
  constructor(public netType: string, public addrType: string, public connectionAddress: string) {}
}

export class Group {
  constructor(public semantics: string, public mids: string[]) {}
}

export class Codec {
  payloadType: f64 = ABSENT;
  encodingName: string | null = null;
  clockRate: f64 = ABSENT;
  encodingParameters: f64 = ABSENT;
  parameters: Params | null = null;
  rtcpFeedback: string[] | null = null;
}

export class MediaSection extends CommonAttributes {
  type: string = '';
  port: f64 = ABSENT;
  numberOfPorts: f64 = ABSENT;
  proto: string = '';
  formats: string[] | null = null;
  codecs: Codec[] | null = null;
  rtcpFeedbackWildcard: string[] | null = null;
  information: string | null = null;
  connectionInformation: Connection | null = null;
  bandwidths: Bandwidth[] | null = null;
  encryptionKey: EncryptionKey | null = null;
  mid: string | null = null;
  rtcp: Rtcp | null = null;
  rtcpMux: bool = false;
  rtcpRsize: bool = false;
  sctpPort: f64 = ABSENT;
  maxMessageSize: f64 = ABSENT;
  candidates: Candidate[] | null = null;
  msid: Msid[] | null = null;
  ssrcs: Ssrc[] | null = null;
  ssrcGroups: SsrcGroup[] | null = null;
  rids: Rid[] | null = null;
  simulcast: Simulcast | null = null;
}

export class Sdp extends CommonAttributes {
  protocolVersion: f64 = ABSENT;
  origin: Origin | null = null;
  sessionName: string | null = null;
  sessionInformation: string | null = null;
  uri: string | null = null;
  emailAddresses: string[] | null = null;
  phoneNumbers: string[] | null = null;
  connectionInformation: Connection | null = null;
  bandwidths: Bandwidth[] | null = null;
  timing: Timing[] | null = null;
  encryptionKey: EncryptionKey | null = null;
  group: Group[] | null = null;
  iceLite: bool = false;
  media: MediaSection[] = [];
}
