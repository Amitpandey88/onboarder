export declare function findOnPath(name: any): {
    installed: boolean;
    version?: undefined;
} | {
    installed: boolean;
    version: string;
};
export declare function tunnelTarget(settings: any): string;
export declare function cloudflareCommand(settings: any): string;
export declare function tailscaleCommand(settings: any): string;
export declare function installHint(name: any): "Install Caddy with: sudo apt install caddy" | "See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" | "See https://tailscale.com/download" | "brew install --cask tailscale  (or see https://tailscale.com/download)" | "brew install caddy" | "brew install cloudflared  (or see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)";
export declare function tunnelStatus(settings: any): {
    target: string;
    cloudflare: {
        enabled: boolean;
        installed: boolean;
        version: string;
        command: string;
        install: string;
    };
    tailscale: {
        enabled: boolean;
        installed: boolean;
        version: string;
        command: string;
        install: string;
    };
    note: string;
};
