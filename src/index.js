/* global AFRAME, THREE */
const interpolate = require('color-interpolate');

if (typeof AFRAME === 'undefined') {
    throw new Error('AFRAME not available.');
}

if (typeof THREE === 'undefined') {
    throw new Error('THREE not available.');
}

class TinyTerrain {
    constructor() {
        this.heightFunctions = new Map();
        this.heightFunctions.set('sin', (x, y) => {
            return Math.sin(Math.PI * (Math.sqrt(x*x + y*y)) / 5);
        });

        this.colorFunctions = new Map();
        this.colorFunctions.set('linear-palette', (y, colorPalette, paletteRangeMin, paletteRangeMax, paletteAccuracy, colorCache) => {
            const i = ((y - paletteRangeMin)/(paletteRangeMax-paletteRangeMin)).toFixed(paletteAccuracy);
            if (!colorCache.has(i)) {
                colorCache.set(i, colorPalette(i));
            }
            return colorCache.get(i);
        });
    }
}

window.TINY_TERRAIN = new TinyTerrain()

// Unit vectors
const ui = 1 / Math.sin(Math.PI / 3);
const uj = 1;

AFRAME.registerComponent('terrain', {
    schema: {
        x: {type: 'number', default: 0},
        y: {type: 'number', default: 0},
        z: {type: 'number', default: 0},
        radius: {type: 'number', default: 20},
        step: {type: 'number', default: 1},
        heightFunction: {type: 'string', default: 'sin'},
        colorFunction: {type: 'string', default: 'linear-palette'},
        palette: {type: 'string', default: '#d6a36e, #a1d66e'},
        paletteAccuracy: {type: 'number', default: 2},
        paletteRangeMin: {type: 'number', default: -1},
        paletteRangeMax: {type: 'number', default: 1}
    },

    /**
     * Initial creation and setting of the mesh.
     */
    init: function () {
        let data = this.data;
        let el = this.el;

        this.radius = data.radius;
        this.radiusSquared = this.radius * this.radius;

        this.updateDistanceSquared = (this.radius / 4) * (this.radius / 4)
        const step = data.step;

        let getHeight = window.TINY_TERRAIN.heightFunctions.get(data.heightFunction)
        let getColor = window.TINY_TERRAIN.colorFunctions.get(data.colorFunction)

        const paletteRangeMin = data.paletteRangeMin;
        const paletteRangeMax = data.paletteRangeMax;
        const palette = data.palette.split(",").map(function(item) { return item.trim(); });
        const paletteAccuracy = data.paletteAccuracy;

        const colorPalette = interpolate(palette);
        const colorCache = new Map();

        let getVector3 = (i, j, cx, cy, cz) => {
            return new THREE.Vector3(cx + i * ui + j * ui / 2, cy + getHeight(cx + i * ui + j * ui / 2,cz + j * uj), cz + j * uj)
        };

        let getTriangleDistanceSquared = (i, j, step, primary) => {
            if (primary) {
                return Math.pow((i + 0.5) * ui + j * ui / 2, 2) + Math.pow((j + 0.5) * uj, 2)
            } else {
                return Math.pow((i + 1) * ui + j * ui / 2, 2) + Math.pow((j + 0.5) * uj, 2)
            }
        };

        let addFace = (v, i, j, cx, cy, cz, step, primary) => {
            if (primary) {
                this.geometry.vertices.push(
                    getVector3(i, j, cx, cy, cz),
                    getVector3(i, j + step, cx, cy, cz),
                    getVector3(i + step, j, cx, cy, cz)
                );
            } else {
                this.geometry.vertices.push(
                    getVector3(i, j + step, cx, cy, cz),
                    getVector3(i + step, j + step, cx, cy, cz),
                    getVector3(i + step, j, cx, cy, cz)
                );
            }

            let face = new THREE.Face3(v + 0, v + 1, v + 2);
            face.vertexColors[0] = new THREE.Color(getColor(this.geometry.vertices[v + 0].y - cy, colorPalette, paletteRangeMin, paletteRangeMax, paletteAccuracy, colorCache));
            face.vertexColors[1] = new THREE.Color(getColor(this.geometry.vertices[v + 1].y - cy, colorPalette, paletteRangeMin, paletteRangeMax, paletteAccuracy, colorCache));
            face.vertexColors[2] = new THREE.Color(getColor(this.geometry.vertices[v + 2].y - cy, colorPalette, paletteRangeMin, paletteRangeMax, paletteAccuracy, colorCache));
            this.geometry.faces.push(face);
        };

        this.updateTerrain = (cx, cy, cz) =>
        {
            this.geometry = new THREE.Geometry();

            let v = 0;
            for (let i = -this.radius; i < this.radius; i += step) {
                for (let j = -this.radius; j < this.radius; j += step) {
                    if (getTriangleDistanceSquared(i, j, step, true) <= this.radiusSquared) {
                        addFace(v, i, j, cx, cy, cz, step, true);
                        v += 3;
                    }
                    if (getTriangleDistanceSquared(i, j, step, false) <= this.radiusSquared) {
                        addFace(v, i, j, cx, cy, cz, step, false);
                        v += 3;
                    }
                }
            }

            this.geometry.mergeVertices();
            this.geometry.computeFaceNormals();
            this.geometry.computeVertexNormals();

            this.material = new THREE.MeshLambertMaterial({color: 0xffffff, vertexColors: THREE.VertexColors});

            this.wireMaterial = new THREE.MeshLambertMaterial({
                color: 0xdddddd,
                wireframe: true,
                vertexColors: THREE.VertexColors
            });

            if (this.mesh) {
                el.removeObject3D('mesh');
                this.mesh.geometry.dispose();
                this.mesh.material.dispose();
                this.mesh = undefined;
            }
            if (this.wire) {
                el.removeObject3D('wire');
                this.wire.geometry.dispose();
                this.wire.material.dispose();
                this.wire = undefined;
            }

            this.mesh = new THREE.Mesh(this.geometry, this.material);
            this.wire = new THREE.Mesh(this.geometry, this.wireMaterial);

            el.setObject3D('mesh', this.mesh);
            el.setObject3D('wire', this.wire);
        }

        const cx = data.x;
        const cy = data.y;
        const cz = data.z;
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.updateTerrain(cx, cy, cz)
    },

    update: function (oldData) {
        let data = this.data;

        const cx = (data.x / (2 * ui)).toFixed() * 2 * ui;
        const cy = data.y;
        const cz = (data.z / (4 * uj)).toFixed() * 4 * uj;

        if ((this.cx - cx) * (this.cx - cx) + (this.cz - cz) * (this.cz - cz) >= this.updateDistanceSquared) {
            console.log('recalculated terrain at : ' + this.data.x + ',' + this.data.y)
            this.cx = cx;
            this.cy = cy;
            this.cz = cz;
            this.updateTerrain(cx, cy, cz)
        }
    }

});



AFRAME.registerPrimitive('a-terrain', {
    defaultComponents: {
        terrain: {}
    },
    mappings: {
        x: 'terrain.x',
        y: 'terrain.y',
        z: 'terrain.z',
        radius: 'terrain.radius',
        step: 'terrain.step'
    }
});
