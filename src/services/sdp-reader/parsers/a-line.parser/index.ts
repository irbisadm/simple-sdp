import {Sdp, SdpCommonAttributes, SdpDirection, SdpMediaSection, SdpSetup} from "../../../../interfaces/Sdp";
import {groupParser} from "./group.parser";
import {extmapParser} from "./extmap.parser";
import {rtpmapParser} from "./rtpmap.parser";
import {fmtpParametersParser} from "./fmtp.parser";
import {candidateParser} from "./candidate.parser";
import {findCodec, flag, once, push, required, splitFirst} from "./helpers";

type Scope = 'session' | 'media';

interface AttributeHandler {
  /** Where the attribute is interpreted. Elsewhere it is kept as a generic attribute. */
  scopes: Scope[];
  /**
   * Applies the attribute to the section. Returns false if the attribute cannot be
   * represented by a typed field (e.g. rtpmap for a payload type absent from m=);
   * it is then kept as a generic attribute.
   */
  parse: (section: any, value: string | undefined) => boolean | void;
}

const BOTH: Scope[] = ['session', 'media'];
const MEDIA: Scope[] = ['media'];
const SESSION: Scope[] = ['session'];

const SETUP: SdpSetup[] = ['active', 'passive', 'actpass', 'holdconn'];

const direction = (dir: SdpDirection): AttributeHandler => ({
  scopes: BOTH,
  parse: (section: SdpCommonAttributes) => once(section, 'direction', dir, dir),
});

const handlers: Record<string, AttributeHandler> = {
  'sendrecv': direction('sendrecv'),
  'sendonly': direction('sendonly'),
  'recvonly': direction('recvonly'),
  'inactive': direction('inactive'),
  'ice-ufrag': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => once(section, 'iceUfrag', required(value, 'a=ice-ufrag:<ufrag>'), 'ice-ufrag'),
  },
  'ice-pwd': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => once(section, 'icePwd', required(value, 'a=ice-pwd:<password>'), 'ice-pwd'),
  },
  'ice-options': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) =>
      once(section, 'iceOptions', required(value, 'a=ice-options:<option> ...').split(' '), 'ice-options'),
  },
  'ice-lite': {
    scopes: SESSION,
    parse: (section: Sdp, value) => once(section, 'iceLite', flag(value), 'ice-lite'),
  },
  'candidate': {
    scopes: MEDIA,
    parse: (section: SdpMediaSection, value) => push(section, 'candidates', candidateParser(required(value, 'a=candidate:<candidate>'))),
  },
  'end-of-candidates': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => once(section, 'endOfCandidates', flag(value), 'end-of-candidates'),
  },
  'fingerprint': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => {
      const [hashFunction, fingerprint] = splitFirst(required(value, 'a=fingerprint:<hash-function> <fingerprint>'));
      if (!fingerprint || fingerprint.includes(' ')) {
        throw new Error('expected "a=fingerprint:<hash-function> <fingerprint>"');
      }
      push(section, 'fingerprints', {hashFunction, fingerprint});
    },
  },
  'setup': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => {
      if (!SETUP.includes(value as SdpSetup)) {
        throw new Error(`a=setup must be one of ${SETUP.join(', ')}`);
      }
      once(section, 'setup', value as SdpSetup, 'setup');
    },
  },
  'extmap': {
    scopes: BOTH,
    parse: (section: SdpCommonAttributes, value) => push(section, 'extmap', extmapParser(required(value, 'a=extmap:<id> <uri>'))),
  },
  'group': {
    scopes: SESSION,
    parse: (section: Sdp, value) => push(section, 'group', groupParser(required(value, 'a=group:<semantics> <mid> ...'))),
  },
  'mid': {
    scopes: MEDIA,
    parse: (section: SdpMediaSection, value) => once(section, 'mid', required(value, 'a=mid:<identification-tag>'), 'mid'),
  },
  'rtpmap': {
    scopes: MEDIA,
    parse: (section: SdpMediaSection, value) => {
      const [pt, encoding] = splitFirst(required(value, 'a=rtpmap:<payload type> <encoding>'));
      const codec = section.codecs ? findCodec(section, pt) : undefined;
      if (!codec || codec.encodingName !== undefined) {
        return false;
      }
      rtpmapParser(codec, encoding ?? '');
    },
  },
  'fmtp': {
    scopes: MEDIA,
    parse: (section: SdpMediaSection, value) => {
      const [pt, params] = splitFirst(required(value, 'a=fmtp:<format> <parameters>'));
      const codec = section.codecs ? findCodec(section, pt) : undefined;
      if (!codec || codec.parameters !== undefined || params === undefined) {
        return false;
      }
      codec.parameters = fmtpParametersParser(params);
    },
  },
  'rtcp-fb': {
    scopes: MEDIA,
    parse: (section: SdpMediaSection, value) => {
      const [pt, feedback] = splitFirst(required(value, 'a=rtcp-fb:<payload type> <feedback>'));
      if (!feedback || !section.codecs) {
        return false;
      }
      if (pt === '*') {
        push(section, 'rtcpFeedbackWildcard', feedback);
        return;
      }
      const codec = findCodec(section, pt);
      if (!codec) {
        return false;
      }
      push(codec, 'rtcpFeedback', feedback);
    },
  },
};

/**
 * Parses the value of an `a=` line (without the `a=` prefix) into the section.
 * Unknown attributes, and known attributes outside their scope, are kept in `attributes`.
 */
export const aLineParser = (section: Sdp | SdpMediaSection, scope: Scope, attribute: string): void => {
  const idx = attribute.indexOf(':');
  const name = idx === -1 ? attribute : attribute.slice(0, idx);
  const value = idx === -1 ? undefined : attribute.slice(idx + 1);
  if (name.length === 0) {
    throw new Error('empty attribute name');
  }
  const handler = handlers[name];
  if (handler && handler.scopes.includes(scope) && handler.parse(section, value) !== false) {
    return;
  }
  push(section, 'attributes', value === undefined ? {name} : {name, value});
}
