const version = '1.0.0';

export const APP_INFO = {
	version: version,
	downloadLink: `https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/release/${version}.zip`,
	checksum: 'sha256:0785a08dd7fa89b93f019e62f52ced1f5b1774d3cd36e02b8e8e69f16aa1feeb',
	githubLink: 'https://github.com/aciddust/ddt-piano'
};

export const MIDI_SOURCES = [
	{
		name: 'onlinesequencer',
		url: 'https://onlinesequencer.net/sequences',
		description: '온라인 음악 시퀀서입니다. 사용자들이 만든 다양한 시퀀스를 공유하는 플랫폼입니다.'
	},
	{
		name: 'vgmusic',
		url: 'https://www.vgmusic.com/music/',
		description: '1996년부터 비디오 게임 음악을 전문으로 하는 사이트입니다. 다양한 게임의 MIDI 파일을 제공합니다.'
	},
	{
		name: 'midex',
		url: 'https://midiex.net/',
		description: '아마추어 음악인 커뮤니티. 자작곡, 자작앨범 발매, 미디 자료 공유 등이 이루어지는 곳입니다.'
	},
	{
		name: 'bitmidi',
		url: 'https://bitmidi.com/',
		description: '어쩌면 괜찮은 악보를 찾을 수도 있습니다.'
	}
];

export const PLACEHOLDER_IMAGES = {
	usage1:
		// 'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/image/image.png', // Main usage
		'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/image/image.png?token=GHSAT0AAAAAADTG42V4Z66CDEJGSGTBYHUM2M2U3MA', // Main usage
	thumbnail:
		'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/image/thumbnail.png', // Example thumbnail
	video1:
		'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/video/ddt-example-01.mp4', // Video placeholder 1
	video2:
		'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/video/ddt-example-02.mp4' // Video placeholder 2
};
