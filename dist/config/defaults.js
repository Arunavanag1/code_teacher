/**
 * Default configuration values for code-teacher.
 * These are used when no config file is present or when config fields are omitted.
 */
export const defaults = {
    ignore: [
        'node_modules',
        'dist',
        'build',
        '.git',
        '__pycache__',
        '*.min.js',
        '*.min.css',
        '*.lock',
        'package-lock.json',
        'yarn.lock',
        '*.png',
        '*.jpg',
        '*.gif',
        '*.svg',
        '*.ico',
        '*.woff',
        '*.woff2',
        '*.ttf',
        '*.eot',
    ],
    maxFileSize: 50000,
    topN: 5,
    provider: undefined,
    model: undefined,
    customAgents: [],
};
//# sourceMappingURL=defaults.js.map