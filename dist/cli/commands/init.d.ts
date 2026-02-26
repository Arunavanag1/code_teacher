/**
 * Init command
 * Creates a starter code-teacher.config.json in the specified directory.
 * Refuses to overwrite an existing config unless --force is passed.
 */
/**
 * Init command handler.
 * Creates a starter code-teacher.config.json in the target directory.
 *
 * @param targetPath - Directory to create the config in (default: current directory)
 * @param options - Command options (--force to overwrite)
 */
export declare function initCommand(targetPath: string, options: {
    force?: boolean;
}): Promise<void>;
//# sourceMappingURL=init.d.ts.map