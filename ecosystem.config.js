module.exports = {
    apps: [
        {
            name: "loveanime-frontend",
            script: "npx",
            args: "serve . -l 3000",
            env: {
                NODE_ENV: "production",
            }
        },
        {
            name: "loveanime-proxy",
            script: "./hls-proxy.js",
            env: {
                NODE_ENV: "production",
                PORT: 4001
            }
        },
        {
            name: "aniwatch-api",
            cwd: "./aniwatch-api",
            script: "npm",
            args: "start",
            env: {
                PORT: 4000,
                ANIWATCH_API_CORS_ALLOWED_ORIGINS: "*"
            }
        }
    ]
};
