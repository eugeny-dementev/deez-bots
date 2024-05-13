import { audioPriorities, subsPriorities } from "./config.js";
import { nameCheckerFactory } from "./helpers.js";
import { MultiTrack } from "./types.js";

export default function animeDubRecognizer(patterns: string[]): MultiTrack {
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
  const mkv = patterns.find((item) => {
    return /\.mkv$/.test(item);
  })

  return mkv || '';
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
