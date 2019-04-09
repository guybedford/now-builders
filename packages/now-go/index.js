'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const path_1 = require('path');
const fs_extra_1 = require('fs-extra');
const build_utils_1 = require('@now/build-utils');
const go_helpers_1 = require('./go-helpers');
exports.config = {
  maxLambdaSize: '10mb'
};
exports.build = async ({ files, entrypoint }) => {
  console.log('Downloading user files...');
  const [goPath, outDir] = await Promise.all([
    build_utils_1.getWriteableDirectory(),
    build_utils_1.getWriteableDirectory()
  ]);
  const srcPath = path_1.join(goPath, 'src', 'lambda');
  const downloadedFiles = await build_utils_1.download(files, srcPath);
  console.log(`Parsing AST for "${entrypoint}"`);
  let parseFunctionName;
  try {
    parseFunctionName = await go_helpers_1.getExportedFunctionName(
      downloadedFiles[entrypoint].fsPath
    );
  } catch (err) {
    console.log(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }
  if (!parseFunctionName) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"`
    );
    console.log(err.message);
    throw err;
  }
  const handlerFunctionName = parseFunctionName.split(',')[0];
  console.log(
    `Found exported function "${handlerFunctionName}" in "${entrypoint}"`
  );
  // we need `main.go` in the same dir as the entrypoint,
  // otherwise `go build` will refuse to build
  const entrypointDirname = path_1.dirname(downloadedFiles[entrypoint].fsPath);
  // check if package name other than main
  const packageName = parseFunctionName.split(',')[1];
  const isGoModExist = await fs_extra_1.pathExists(
    path_1.join(entrypointDirname, 'go.mod')
  );
  if (packageName !== 'main') {
    const go = await go_helpers_1.createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname
      },
      true
    );
    if (!isGoModExist) {
      try {
        const defaultGoModContent = `module ${packageName}`;
        await fs_extra_1.writeFile(
          path_1.join(entrypointDirname, 'go.mod'),
          defaultGoModContent
        );
      } catch (err) {
        console.log(`failed to create default go.mod for ${packageName}`);
        throw err;
      }
    }
    const mainModGoFileName = 'main__mod__.go';
    const modMainGoContents = await fs_extra_1.readFile(
      path_1.join(__dirname, mainModGoFileName),
      'utf8'
    );
    let goPackageName = `${packageName}/${packageName}`;
    const goFuncName = `${packageName}.${handlerFunctionName}`;
    if (isGoModExist) {
      const goModContents = await fs_extra_1.readFile(
        path_1.join(entrypointDirname, 'go.mod'),
        'utf8'
      );
      goPackageName = `${
        goModContents.split('\n')[0].split(' ')[1]
      }/${packageName}`;
    }
    const mainModGoContents = modMainGoContents
      .replace('__NOW_HANDLER_PACKAGE_NAME', goPackageName)
      .replace('__NOW_HANDLER_FUNC_NAME', goFuncName);
    // write main__mod__.go
    await fs_extra_1.writeFile(
      path_1.join(entrypointDirname, mainModGoFileName),
      mainModGoContents
    );
    // move user go file to folder
    try {
      // default path
      let finalDestination = path_1.join(
        entrypointDirname,
        packageName,
        entrypoint
      );
      const entrypointArr = entrypoint.split(path_1.sep);
      // if `entrypoint` include folder, only use filename
      if (entrypointArr.length > 1) {
        finalDestination = path_1.join(
          entrypointDirname,
          packageName,
          entrypointArr[entrypointArr.length - 1]
        );
      }
      await fs_extra_1.move(
        downloadedFiles[entrypoint].fsPath,
        finalDestination
      );
    } catch (err) {
      console.log('failed to move entry to package folder');
      throw err;
    }
    console.log('tidy go.mod file');
    try {
      // ensure go.mod up-to-date
      await go('mod', 'tidy');
    } catch (err) {
      console.log('failed to `go mod tidy`');
      throw err;
    }
    console.log('Running `go build`...');
    const destPath = path_1.join(outDir, 'handler');
    try {
      const src = [path_1.join(entrypointDirname, mainModGoFileName)];
      await go.build({ src, dest: destPath });
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
  } else {
    const go = await go_helpers_1.createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname
      },
      false
    );
    const origianlMainGoContents = await fs_extra_1.readFile(
      path_1.join(__dirname, 'main.go'),
      'utf8'
    );
    const mainGoContents = origianlMainGoContents.replace(
      '__NOW_HANDLER_FUNC_NAME',
      handlerFunctionName
    );
    // in order to allow the user to have `main.go`,
    // we need our `main.go` to be called something else
    const mainGoFileName = 'main__now__go__.go';
    // Go doesn't like to build files in different directories,
    // so now we place `main.go` together with the user code
    await fs_extra_1.writeFile(
      path_1.join(entrypointDirname, mainGoFileName),
      mainGoContents
    );
    // `go get` will look at `*.go` (note we set `cwd`), parse the `import`s
    // and download any packages that aren't part of the stdlib
    try {
      await go.get();
    } catch (err) {
      console.log('failed to `go get`');
      throw err;
    }
    console.log('Running `go build`...');
    const destPath = path_1.join(outDir, 'handler');
    try {
      const src = [
        path_1.join(entrypointDirname, mainGoFileName),
        downloadedFiles[entrypoint].fsPath
      ];
      await go.build({ src, dest: destPath });
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
  }
  const lambda = await build_utils_1.createLambda({
    files: await build_utils_1.glob('**', outDir),
    handler: 'handler',
    runtime: 'go1.x',
    environment: {}
  });
  return {
    [entrypoint]: lambda
  };
};
