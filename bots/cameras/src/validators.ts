export function isValidURL(url: string) {
  return isValidShortURL(url) || isValidRedditURL(url) || isValidReelURL(url);
}

/*
URL {
  href: 'https://youtube.com/shorts/23owdgVAV5k?si=fSGa2TFVepKT7gia',
  origin: 'https://youtube.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'youtube.com',
  hostname: 'youtube.com',
  port: '',
  pathname: '/shorts/23owdgVAV5k',
  search: '?si=fSGa2TFVepKT7gia',
  searchParams: URLSearchParams { 'si' => 'fSGa2TFVepKT7gia' },
  hash: ''
}
*/
export function isValidShortURL(url: string) {
  try {
    new URL(url);

    if (!/shorts\/[a-zA-Z0-9\-_]{11}/.test(url)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/*
URL {
  href: 'https://www.reddit.com/r/nextfuckinglevel/s/TSLgGuuAbd',
  origin: 'https://www.reddit.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'www.reddit.com',
  hostname: 'www.reddit.com',
  port: '',
  pathname: '/r/nextfuckinglevel/s/TSLgGuuAbd',
  search: '',
  searchParams: URLSearchParams {},
  hash: ''
}
URL {
  href: 'https://www.reddit.com/r/ANormalDayInRussia/comments/1c75t2q/russian_spiderman/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button',
  origin: 'https://www.reddit.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'www.reddit.com',
  hostname: 'www.reddit.com',
  port: '',
  pathname: '/r/ANormalDayInRussia/comments/1c75t2q/russian_spiderman/',
  search: '?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button',
  searchParams: URLSearchParams {
    'utm_source' => 'share',
    'utm_medium' => 'web3x',
    'utm_name' => 'web3xcss',
    'utm_term' => '1',
    'utm_content' => 'share_button' },
  hash: ''
}
*/
export function isValidRedditURL(url: string) {
  try {
    const l = new URL(url);

    if (!/reddit\.com/.test(l.hostname)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/*
URL {
  href: 'https://www.instagram.com/reel/C36ehY5LWFh/?igsh=MW9zdzQ3dGduMmNjZg==',
  origin: 'https://www.instagram.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'www.instagram.com',
  hostname: 'www.instagram.com',
  port: '',
  pathname: '/reel/C36ehY5LWFh/',
  search: '?igsh=MW9zdzQ3dGduMmNjZg==',
  searchParams: URLSearchParams { 'igsh' => 'MW9zdzQ3dGduMmNjZg==' },
  hash: ''
}
*/
export function isValidReelURL(url: string) {
  try {
    new URL(url);

    if (!/reel\/[a-zA-Z0-9\-_]{11}/.test(url)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}
