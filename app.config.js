module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';

  return {
    ...config,
    name: isDev ? 'RivalSet Dev' : config.name,
    ios: {
      ...config.ios,
      bundleIdentifier: isDev
        ? 'com.javiercepeda29.rivalset.dev'
        : config.ios.bundleIdentifier,
    },
  };
};
