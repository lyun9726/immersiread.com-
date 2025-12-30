
interface MediaMetadataInit {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: MediaImage[];
}

interface MediaImage {
    src: string;
    sizes?: string;
    type?: string;
}

declare class MediaMetadata {
    constructor(init?: MediaMetadataInit);
    title: string;
    artist: string;
    album: string;
    artwork: MediaImage[];
}

type MediaSessionAction = 'play' | 'pause' | 'seekbackward' | 'seekforward' | 'previoustrack' | 'nexttrack' | 'skipad' | 'stop' | 'seekto';

interface MediaSessionActionDetails {
    action: MediaSessionAction;
    seekOffset?: number;
    seekTime?: number;
    fastSeek?: boolean;
}

type MediaSessionActionHandler = (details: MediaSessionActionDetails) => void;

type MediaSessionPlaybackState = 'none' | 'paused' | 'playing';

interface MediaSession {
    metadata: MediaMetadata | null;
    playbackState: MediaSessionPlaybackState;
    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
    setPositionState?(state?: MediaPositionState): void;
}

interface MediaPositionState {
    duration?: number;
    playbackRate?: number;
    position?: number;
}

interface Navigator {
    readonly mediaSession: MediaSession;
}
