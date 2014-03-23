var glslify = require('glslify');
var shell = window.shell = require('gl-now')();
var ndarray = require('ndarray');
var ndfill = require('ndarray-fill');
var createTexture = require('gl-texture2d');
var Vec2 = require('vec2');

var createRaymarchProgram = glslify({
  vertex: './shaders/raymarch.vert',
  fragment: './shaders/raymarch.frag'
});

var cutterRadius = 0.1;

var uniforms = {
  time : 0,
  mouse : [0, 0],
  resolution: [0, 0],
  cutterRadius : cutterRadius
};

shell.on('gl-init', function() {
  var gl = this.gl;

  this.raymarchProgram = createRaymarchProgram(this.gl);
  this.raymarchProgram.bind();

  this.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    1, 1, 0,
    -1, 1, 0,
    -1, -1, 0,
    1, 1, 0,
    1, -1, 0,
    -1, -1, 0
  ]), gl.STATIC_DRAW)
  this.raymarchProgram.attributes.position.pointer();


  this.depthBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.depthBuffer);

  var width = this.raymarchProgram.uniforms.depth_width = 2048;
  var height = this.raymarchProgram.uniforms.depth_height = 2048;

  this.raymarchProgram.uniforms.depth_stride = width;

  this.depthArray = ndarray(new Float32Array(width*height), [width, height]);

  this.depthTexture = createTexture(gl, this.depthArray);

  this.depthTexture.bind('depth');
});


var mouse = [0, window.innerHeight];
document.addEventListener('mousemove', function(ev) {
  mouse[0] = ev.clientX;
  mouse[1] = ev.clientY;
});

var elapsed = 0;
var start = Date.now(), first = false, v = -.01;

setInterval(function() {
  v += .0005;
}, 100);

var ratio = (1/2048);
var r = Math.floor(cutterRadius / ratio);

var tool = ndarray(new Float32Array((r*2 * r*2) * 4), [r*2*4, r*2*4]);

ndfill(tool, function(i, j) {
  var di = (i - r);
  var dj = (j - r);
  var dz = r;//(cutterRadius - 0.05) / ratio;
  var l = Math.sqrt(di * di + dj * dj);
  var dist = Math.sqrt(dz * dz - l * l) / r;
  return dist;
});

var render = function(t) {
  var gl = this.gl;

  this.raymarchProgram.uniforms.resolution = [
    gl.drawingBufferWidth,
    gl.drawingBufferHeight
  ];

  this.raymarchProgram.uniforms.mouse = mouse;

  var time = this.raymarchProgram.uniforms.time = (Date.now() - start)/1000;

  var ctime = Math.cos(time)/2;
  var stime = Math.sin(time)/2;

  this.raymarchProgram.uniforms.cutterPosition = [
    stime/2, -(v + .005), ctime/2
  ];

  this.raymarchProgram.uniforms.cutterRadius = cutterRadius;

  var areax = (Math.floor(ctime*1024) + 1024);
  var areay = (Math.floor(stime*1024) + 1024);

  var depthArray = this.depthArray.hi(areax+r, areay+r).lo(areax-r, areay-r);
  ndfill(depthArray, function(i, j) {
    var orig = depthArray.get(i, j);

    var map = tool.get(i, j);
    var computed = v * map;

    if (computed > orig && map > 0) {
      return computed;
    } else {
      return orig;
    }
  });

  this.depthTexture.setPixels(depthArray, areay - r, areax - r);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

shell.on('gl-render', render);
