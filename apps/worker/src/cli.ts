import 'reflect-metadata';
import { CommanderError } from 'commander';
import { createProgram, reportCliError } from './entrypoints/cli/cli.program.ts';

createProgram()
  .parseAsync(process.argv)
  .catch((error) => {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }
    reportCliError(error);
    process.exitCode = 1;
  });
