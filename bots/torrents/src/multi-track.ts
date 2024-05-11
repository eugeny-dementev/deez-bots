import { audioPriorities, subsPriorities } from "./config.js";
import { nameCheckerFactory } from "./helpers.js";

export default function animeDubRecognizer(patterns: string[]) {
  const videoPattern = getVideo(patterns);
  const audioPattern = getAudio(patterns);
  const subtitlePattern = getSubs(patterns);

  return [
    videoPattern,
    audioPattern,
    subtitlePattern,
  ];
}

export function getVideo(patterns: string[]) {
  return patterns.find((item) => {
    return /\.mkv$/.test(item);
  })
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
