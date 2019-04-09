'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function(mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const tar_1 = __importDefault(require('tar'));
const execa_1 = __importDefault(require('execa'));
const node_fetch_1 = __importDefault(require('node-fetch'));
const fs_extra_1 = require('fs-extra');
const path_1 = require('path');
const debug_1 = __importDefault(require('debug'));
const debug = debug_1.default('@now/go:go-helpers');
const archMap = new Map([['x64', 'amd64'], ['x86', '386']]);
const platformMap = new Map([['win32', 'windows']]);
// Location where the `go` binary will be installed after `postinstall`
const GO_DIR = path_1.join(__dirname, 'go');
const GO_BIN = path_1.join(GO_DIR, 'bin/go');
const getPlatform = p => platformMap.get(p) || p;
const getArch = a => archMap.get(a) || a;
const getGoUrl = (version, platform, arch) => {
  const goArch = getArch(arch);
  const goPlatform = getPlatform(platform);
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return `https://dl.google.com/go/go${version}.${goPlatform}-${goArch}.${ext}`;
};
async function getExportedFunctionName(filePath) {
  debug('Detecting handler name for %o', filePath);
  const bin = path_1.join(__dirname, 'get-exported-function-name');
  const args = [filePath];
  const name = await execa_1.default.stdout(bin, args);
  debug('Detected exported name %o', name);
  return name;
}
exports.getExportedFunctionName = getExportedFunctionName;
// Creates a `$GOPATH` directory tree, as per `go help gopath` instructions.
// Without this, `go` won't recognize the `$GOPATH`.
function createGoPathTree(goPath, platform, arch) {
  const tuple = `${getPlatform(platform)}_${getArch(arch)}`;
  debug('Creating GOPATH directory structure for %o (%s)', goPath, tuple);
  return Promise.all([
    fs_extra_1.mkdirp(path_1.join(goPath, 'bin')),
    fs_extra_1.mkdirp(path_1.join(goPath, 'pkg', tuple))
  ]);
}
async function get({ src } = {}) {
  const args = ['get'];
  if (src) {
    debug('Fetching `go` dependencies for file %o', src);
    args.push(src);
  } else {
    debug('Fetching `go` dependencies for cwd %o', this.cwd);
  }
  await this(...args);
}
async function build({ src, dest }) {
  debug('Building `go` binary %o -> %o', src, dest);
  let sources;
  if (Array.isArray(src)) {
    sources = src;
  } else {
    sources = [src];
  }
  await this('build', '-o', dest, ...sources);
}
async function createGo(
  goPath,
  platform = process.platform,
  arch = process.arch,
  opts = {},
  goMod = false
) {
  const env = {
    ...process.env,
    PATH: `${path_1.dirname(GO_BIN)}:${process.env.PATH}`,
    GOPATH: goPath,
    ...opts.env
  };
  if (goMod) {
    env.GO111MODULE = 'on';
  }
  function go(...args) {
    debug('Exec %o', `go ${args.join(' ')}`);
    return execa_1.default('go', args, { stdio: 'inherit', ...opts, env });
  }
  go.cwd = opts.cwd || process.cwd();
  go.get = get;
  go.build = build;
  go.goPath = goPath;
  await createGoPathTree(goPath, platform, arch);
  return go;
}
exports.createGo = createGo;
async function downloadGo(
  dir = GO_DIR,
  version = '1.12',
  platform = process.platform,
  arch = process.arch
) {
  debug('Installing `go` v%s to %o for %s %s', version, dir, platform, arch);
  const url = getGoUrl(version, platform, arch);
  debug('Downloading `go` URL: %o', url);
  const res = await node_fetch_1.default(url);
  if (!res.ok) {
    throw new Error(`Failed to download: ${url} (${res.status})`);
  }
  // TODO: use a zip extractor when `ext === "zip"`
  await fs_extra_1.mkdirp(dir);
  await new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar_1.default.extract({ cwd: dir, strip: 1 }))
      .on('error', reject)
      .on('finish', resolve);
  });
  return createGo(dir, platform, arch);
}
exports.downloadGo = downloadGo;
