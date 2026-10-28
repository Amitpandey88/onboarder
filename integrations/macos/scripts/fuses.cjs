module.exports = async context => {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(require('node:path').join(context.appOutDir, 'Onboarder.app'), { version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
