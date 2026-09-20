const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  target: "web",
  entry: {
    index: "./src/index.tsx",
  },
  output: {
    filename: "[name].[contenthash].js",
    path: path.resolve(__dirname, "../dist"),
    publicPath: '/',
    clean: true,
  },
  devtool: "source-map",
  devServer: {
    static: {
      directory: path.resolve(__dirname, "../dist"),
    },
    port: 3003,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
      {
        test: /\.svg$/i,
        oneOf: [
          {
            resourceQuery: /react/,
            use: ['@svgr/webpack'],
          },
          {
            type: "asset/resource",
          }
        ],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: "asset/resource",
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              modules: {
                namedExport: false,
                localIdentName: "[local]--[hash:base64:5]"
              },
            },
          },
          "sass-loader",
        ],
      },
      {
        test: /\.toml$/,
        use: "file-loader",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    fallback: {
      "stream": false
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "public/index.html",
    }),
    new CopyPlugin({
      patterns: [
        { from: "public/404.html", to: "404.html" },
        { from: "public/status.worker.js", to: "status.worker.js" },
        { from: "public/favicon.ico", to: "favicon.ico"}
      ],
    }),
    new webpack.DefinePlugin({
      "process.env.MAIN_NET": JSON.stringify(process.env.MAIN_NET || "false"),
      "process.env.NATIVE_APP": JSON.stringify(process.env.NATIVE_APP || "false"),
      // Where the DAO backend lives. Defaults to a local dev server; set it
      // in the build command to point a build at a deployed backend. Whatever
      // it is set to must also be listed in the connect-src of the content
      // security policy, in public/index.html and in main.js.
      "process.env.DAO_SERVER_URL": JSON.stringify(
        process.env.DAO_SERVER_URL || "https://api.daov2.site"
      ),
    }),
  ],
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
};
