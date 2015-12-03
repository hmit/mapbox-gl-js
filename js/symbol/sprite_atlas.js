'use strict';

var BinPack = require('./bin_pack');

module.exports = SpriteAtlas;

function SpriteAtlas(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.bin = new BinPack(this.width, this.height);
    this.icons = {};
    this.patterns = {};
}

SpriteAtlas.prototype.setSprite = function(sprite) {
    this.sprite = sprite;
};

SpriteAtlas.prototype.addIcons = function(icons, callback) {
    for (var i = 0; i < icons.length; i++) {
        this.getIcon(icons[i]);
    }

    callback(null, this.icons);
};

SpriteAtlas.prototype.getIcon = function(name) {
    return this._getImage(name, this.icons, false);
};

SpriteAtlas.prototype.getPattern = function(name) {
    return this._getImage(name, this.patterns, true);
};

SpriteAtlas.prototype._getImage = function(name, cache, pattern) {
    if (cache[name]) {
        return cache[name];
    }

    if (!this.sprite) {
        return null;
    }

    var src = this.sprite.getIcon(name);
    if (!src) {
        return null;
    }

    var width = src.width / src.pixelRatio,
        height = src.height / src.pixelRatio;

    // Pad icons to prevent them from polluting neighbours during linear interpolation.
    var padding = 1,
        paddedWidth = width + 2 * padding,
        paddedHeight = height + 2 * padding;

    // Increase to next number divisible by 4, but at least 1. This is so we can scale
    // down the texture coordinates and pack them into 2 bytes rather than 4 bytes.
    var packedWidth = paddedWidth + (4 - paddedWidth % 4),
        packedHeight = paddedHeight + (4 - paddedHeight % 4);

    var dst = this.bin.allocate(packedWidth, packedHeight);
    if (!dst) {
        return null;
    }

    var dstX = dst.x + padding,
        dstY = dst.y + padding;

    var icon = cache[name] = {
        rect: dst,
        width: width,
        height: height,
        sdf: src.sdf,
        tl: [dstX / this.width,
             dstY / this.height],
        br: [(dstX + width) / this.width,
             (dstY + height) / this.height]
    };

    if (!this.data) {
        var w = Math.ceil(this.width * this.pixelRatio);
        var h = Math.ceil(this.height * this.pixelRatio);
        this.data = new Uint32Array(w * h);
        for (var i = 0; i < this.data.length; i++) {
            this.data[i] = 0;
        }
    }

    this.dirty = true;

    var srcData = new Uint32Array(this.sprite.img.data.buffer),
        srcStride = this.sprite.img.width,
        dstStride = Math.ceil(this.width * this.pixelRatio),
        srcX = src.x,
        srcY = src.y,
        srcI = srcY * srcStride + srcX,
        dstI = (dstY * dstStride + dstX) * this.pixelRatio,
        x, y;

    if (pattern) {
        // Add 1 pixel wrapped padding on each side of the icon.
        dstI -= dstStride;
        for (y = -1; y <= src.height; y++, srcI = ((y + src.height) % src.height + srcY) * srcStride + srcX, dstI += dstStride) {
            for (x = -1; x <= src.width; x++) {
                this.data[dstI + x] = srcData[srcI + ((x + src.width) % src.width)];
            }
        }

    } else {
        for (y = 0; y < src.height; y++, srcI += srcStride, dstI += dstStride) {
            for (x = 0; x < src.width; x++) {
                this.data[dstI + x] = srcData[srcI + x];
            }
        }
    }

    return icon;
};

SpriteAtlas.prototype.bind = function(gl, linear) {
    var first = false;

    if (!this.texture) {
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        first = true;
    } else {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    var filterVal = linear ? gl.LINEAR : gl.NEAREST;
    if (filterVal !== this.filter) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterVal);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterVal);
        this.filter = filterVal;
    }

    if (this.dirty) {
        if (first) {
            gl.texImage2D(
                gl.TEXTURE_2D, // enum target
                0, // ind level
                gl.RGBA, // ind internalformat
                this.width * this.pixelRatio, // GLsizei width
                this.height * this.pixelRatio, // GLsizei height
                0, // ind border
                gl.RGBA, // enum format
                gl.UNSIGNED_BYTE, // enum type
                new Uint8Array(this.data.buffer) // Object data
            );
        } else {
            gl.texSubImage2D(
                gl.TEXTURE_2D, // enum target
                0, // int level
                0, // int xoffset
                0, // int yoffset
                this.width * this.pixelRatio, // long width
                this.height * this.pixelRatio, // long height
                gl.RGBA, // enum format
                gl.UNSIGNED_BYTE, // enum type
                new Uint8Array(this.data.buffer) // Object pixels
            );
        }

        this.dirty = false;
    }
};
