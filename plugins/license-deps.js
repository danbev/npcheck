const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execSync } = require('child_process');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
const checker = require('license-checker');
const { pass, fail, warn } = require('../lib/logger');

const checkerInitAsync = promisify(checker.init);

module.exports = async (context) => {
  // get stuff from context
  const { pkgInfo, config, core } = context;

  // creating environment folder
  const envPath = path.resolve(process.cwd(), '.npcheck-env');
  await mkdirp(envPath);

  let npmCommand = 'npm install';

  // build npm command
  npmCommand = npmCommand.concat(' --no-package-lock');
  npmCommand = npmCommand.concat(` --prefix ${envPath}`);
  npmCommand = npmCommand.concat(` ${pkgInfo.name}`);

  // installing npm module
  const npmOutput = execSync(
    npmCommand,
    {
      encoding: 'utf-8',
      cwd: __dirname
    }
  );

  console.log(chalk.magenta(npmOutput));

  // checking license of dependency tree
  const packageLicenses = await checkerInitAsync({ start: envPath });
  // remove the module itself from the list
  const moduleDependencies = Object.entries(packageLicenses).filter(([pkg]) => !pkg.includes(pkgInfo.name));

  for (const [key, value] of moduleDependencies) {
    // license output
    const output = `Checking license of ${chalk.cyan(key)}`.padEnd(75, ' ');

    // general allowed licenses
    const licenses = config.licenses?.allow || [];
    const licensesSpecific = config.licenses.rules[pkgInfo.name]?.allow || [];

    // module specific allowed licenses
    const licensePass = licenses.find((name) => name === value.licenses);
    const licenseSpecificPass = licensesSpecific.find((name) => name === value.licenses);

    if (licensePass || licenseSpecificPass) {
      pass(output);
      continue;
    }

    // force pass licenses for specific module
    const licenseOverrides = config.licenses.rules[pkgInfo.name]?.override || [];
    const licenseForcePass = licenseOverrides.find((name) => name === value.licenses);

    if (licenseForcePass) {
      core.warnings++;
      core.logs.push({
        type: 'warning',
        message: `The module "${pkgInfo.name}" depends on the "${key}" package which is under the yet undetermined license "${value.licenses}". (Manual review needed)`
      });
      warn(output);
      continue;
    }

    core.errors++;
    core.logs.push({
      type: 'error',
      message: `The module "${pkgInfo.name}" depends on the "${key}" package which is under the non-acceptable license "${value.licenses}".`
    });
    fail(output);
  }

  // clean up node_modules
  fs.rmdirSync(envPath, { recursive: true });
};
