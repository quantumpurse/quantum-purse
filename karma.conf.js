const webpack = require("webpack");

module.exports = function (config) {
  config.set({
    frameworks: ["mocha"],
    files: [
      "tests/*.test.ts",
      {
        pattern: "node_modules/quantum-purse-key-vault/quantum_purse_key_vault_bg.wasm",
        type: "wasm",
        served: true,
        included: false,
      },
    ],
    preprocessors: {
      "tests/**/*.ts": ["webpack"],
    },
    webpack: {
      mode: "development",
      module: {
        rules: [
          {
            test: /\.(ts|js)$/,
            use: [
              {
                loader: "babel-loader",
                options: {
                  presets: ["@babel/preset-env"],
                },
              },
              "ts-loader",
            ],
            exclude: /node_modules/,
          },
          {
            test: /\.wasm$/,
            type: "asset/resource",
          },
          {
            test: /\.toml$/,
            use: "file-loader",
          },
        ],
      },
      resolve: {
        extensions: [".ts", ".js"],
        fallback: {
          "stream": false
        }
      },
      plugins: [
        new webpack.DefinePlugin({
          "process.env.MAIN_NET": JSON.stringify(process.env.MAIN_NET || "false"),
          "process.env.NATIVE_APP": JSON.stringify(process.env.NATIVE_APP || "false"),
          // Must mirror webpack.common.js: core/config.ts reads this, and an
          // un-replaced process.env is a ReferenceError that kills the whole
          // suite at module load, not just the tests that use it.
          "process.env.DAO_SERVER_URL": JSON.stringify(
            process.env.DAO_SERVER_URL || "https://api.daov2.site"
          ),
        }),
      ],
    },
    mime: {
      "application/wasm": ["wasm"],
    },
    browsers: ['ChromeWithFlags'],
    customLaunchers: {
      ChromeWithFlags: {
        base: 'Chrome',
        flags: ['--enable-features=SharedArrayBuffer'],
      },
    },
    singleRun: true,
    plugins: [
      "karma-mocha",
      "karma-chai",
      "karma-chrome-launcher",
      "karma-webpack",
    ],
    logLevel: config.LOG_INFO,
  });
};
