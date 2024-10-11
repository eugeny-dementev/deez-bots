import { audioPriorities, subsPriorities } from "./config.js";
import { nameCheckerFactory } from "./helpers.js";
import { MultiTrack } from "./types.js";

export default function multiTrackRecognizer(patterns: string[]): MultiTrack {
  const videoPattern = getVideo(patterns);
  const audioPattern = getAudio(patterns);
  const subtitlePattern = getSubs(patterns);

  return {
    video: videoPattern,
    audio: audioPattern,
    subs: subtitlePattern,
  };
}

export function getVideo(patterns: string[]): string {
  const mkvs = patterns
    .filter((item) => {
      return /\.mkv$/.test(item);
    })
    .sort((a, b) => a.length - b.length)

  if (mkvs.length === 0) {
    return '';
  }

  return mkvs[0];
}

export function getAudio(patterns: string[]) {
  const audios = patterns
    .filter((item) => /\.mka$/.test(item))
    .filter((item) => !/ENG|eng/.test(item))
    .sort((a, b) => getAudioWeight(b) - getAudioWeight(a));

  return audios[0];
}

export function getSubs(patterns: string[]) {
  const subs = patterns
    .filter((item) => /\.ass$/.test(item))
    .filter((item) => !/eng/i.test(item))
    .sort((a, b) => getSubWeight(b) - getSubWeight(a));

  return subs[0];
}

const audioWeights = audioPriorities.map(nameCheckerFactory);

export function getAudioWeight(item: string) {
  for (let i = audioWeights.length - 1; i >= 0; i--) {
    const test = audioWeights[i];

    if (test(item)) return i;
  }

  return -1;
}

const subsWeights = subsPriorities.map(nameCheckerFactory);

export function getSubWeight(item: string) {
  for (let i = subsWeights.length - 1; i >= 0; i--) {
    const test = subsWeights[i];

    if (test(item)) return i;
  }

  return -1;
}
