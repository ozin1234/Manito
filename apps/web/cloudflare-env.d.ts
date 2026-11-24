declare namespace Cloudflare {
  interface Env {
    KROAD_API_KEY?: string;
    GEMINI_API_KEY?: string;
    UWAT_MODEL?: string;
    KROAD_PUBLIC_ORIGIN?: string;
    KROAD_ADMIN_USERNAME?: string;
    KROAD_ADMIN_PASSWORD_HASH?: string;
    KROAD_ADMIN_SESSION_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
