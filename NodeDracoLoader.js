// Copied from https://gist.github.com/donmccurdy/323c6363ac7ca8a7de6a3362d7fdddb4
// Copyright 2016 The Draco Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
"use strict";
const decoderPromise = require("draco3dgltf").createDecoderModule();

/**
 * @param {THREE.LoadingManager} manager
 */

module.exports = THREE.DRACOLoader = function (manager) {
  this.timeLoaded = 0;
  this.manager = manager || THREE.DefaultLoadingManager;
  this.materials = null;
  this.verbosity = 0;
  this.attributeOptions = {};
  this.drawMode = THREE.TrianglesDrawMode;
  // Native Draco attribute type to Three.JS attribute type.
  this.nativeAttributeMap = {
    position: "POSITION",
    normal: "NORMAL",
    color: "COLOR",
    uv: "TEX_COORD",
  };
};

THREE.DRACOLoader.prototype = {
  constructor: THREE.DRACOLoader,

  load: function (url, onLoad, onProgress, onError) {
    var scope = this;
    var loader = new THREE.FileLoader(scope.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.load(
      url,
      function (blob) {
        scope.decodeDracoFile(blob, onLoad);
      },
      onProgress,
      onError
    );
  },

  setDecoderPath: function (value) {
    this.path = value;
    return this;
  },

  setVerbosity: function (level) {
    this.verbosity = level;
    return this;
  },

  /**
   *  Sets desired mode for generated geometry indices.
   *  Can be either:
   *      THREE.TrianglesDrawMode
   *      THREE.TriangleStripDrawMode
   */
  setDrawMode: function (drawMode) {
    this.drawMode = drawMode;
    return this;
  },

  /**
   * Skips dequantization for a specific attribute.
   * |attributeName| is the THREE.js name of the given attribute type.
   * The only currently supported |attributeName| is 'position', more may be
   * added in future.
   */
  setSkipDequantization: function (attributeName, skip) {
    var skipDequantization = true;
    if (typeof skip !== "undefined") skipDequantization = skip;
    this.getAttributeOptions(
      attributeName
    ).skipDequantization = skipDequantization;
    return this;
  },

  /**
   * Decompresses a Draco buffer. Names of attributes (for ID and type maps)
   * must be one of the supported three.js types, including: position, color,
   * normal, uv, uv2, skinIndex, skinWeight.
   *
   * @param {ArrayBuffer} rawBuffer
   * @param {Function} callback
   * @param {Object|undefined} attributeUniqueIdMap Provides a pre-defined ID
   *     for each attribute in the geometry to be decoded. If given,
   *     `attributeTypeMap` is required and `nativeAttributeMap` will be
   *     ignored.
   * @param {Object|undefined} attributeTypeMap Provides a predefined data
   *     type (as a typed array constructor) for each attribute in the
   *     geometry to be decoded.
   */
  decodeDracoFile: function (
    rawBuffer,
    callback,
    attributeUniqueIdMap,
    attributeTypeMap
  ) {
    decoderPromise.then((decoder) => {
      this.decodeDracoFileInternal(
        rawBuffer,
        decoder,
        callback,
        attributeUniqueIdMap,
        attributeTypeMap
      );
    });
  },

  decodeDracoFileInternal: function (
    rawBuffer,
    dracoDecoder,
    callback,
    attributeUniqueIdMap,
    attributeTypeMap
  ) {
    /*
     * Here is how to use Draco Javascript decoder and get the geometry.
     */
    var buffer = new dracoDecoder.DecoderBuffer();
    buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
    var decoder = new dracoDecoder.Decoder();

    /*
     * Determine what type is this file: mesh or point cloud.
     */
    var geometryType = decoder.GetEncodedGeometryType(buffer);
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      if (this.verbosity > 0) {
        console.log("Loaded a mesh.");
      }
    } else if (geometryType == dracoDecoder.POINT_CLOUD) {
      if (this.verbosity > 0) {
        console.log("Loaded a point cloud.");
      }
    } else {
      var errorMsg = "THREE.DRACOLoader: Unknown geometry type.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    callback(
      this.convertDracoGeometryTo3JS(
        dracoDecoder,
        decoder,
        geometryType,
        buffer,
        attributeUniqueIdMap,
        attributeTypeMap
      )
    );
  },

  addAttributeToGeometry: function (
    dracoDecoder,
    decoder,
    dracoGeometry,
    attributeName,
    attributeType,
    attribute,
    geometry,
    geometryBuffer
  ) {
    if (attribute.ptr === 0) {
      var errorMsg = "THREE.DRACOLoader: No attribute " + attributeName;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    var numComponents = attribute.num_components();
    var numPoints = dracoGeometry.num_points();
    var numValues = numPoints * numComponents;
    var attributeData;
    var TypedBufferAttribute;

    switch (attributeType) {
      case Float32Array:
        attributeData = new dracoDecoder.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Float32Array(numValues);
        TypedBufferAttribute = THREE.Float32BufferAttribute;
        break;

      case Int8Array:
        attributeData = new dracoDecoder.DracoInt8Array();
        decoder.GetAttributeInt8ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Int8Array(numValues);
        TypedBufferAttribute = THREE.Int8BufferAttribute;
        break;

      case Int16Array:
        attributeData = new dracoDecoder.DracoInt16Array();
        decoder.GetAttributeInt16ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Int16Array(numValues);
        TypedBufferAttribute = THREE.Int16BufferAttribute;
        break;

      case Int32Array:
        attributeData = new dracoDecoder.DracoInt32Array();
        decoder.GetAttributeInt32ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Int32Array(numValues);
        TypedBufferAttribute = THREE.Int32BufferAttribute;
        break;

      case Uint8Array:
        attributeData = new dracoDecoder.DracoUInt8Array();
        decoder.GetAttributeUInt8ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Uint8Array(numValues);
        TypedBufferAttribute = THREE.Uint8BufferAttribute;
        break;

      case Uint16Array:
        attributeData = new dracoDecoder.DracoUInt16Array();
        decoder.GetAttributeUInt16ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Uint16Array(numValues);
        TypedBufferAttribute = THREE.Uint16BufferAttribute;
        break;

      case Uint32Array:
        attributeData = new dracoDecoder.DracoUInt32Array();
        decoder.GetAttributeUInt32ForAllPoints(
          dracoGeometry,
          attribute,
          attributeData
        );
        geometryBuffer[attributeName] = new Uint32Array(numValues);
        TypedBufferAttribute = THREE.Uint32BufferAttribute;
        break;

      default:
        var errorMsg = "THREE.DRACOLoader: Unexpected attribute type.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    // Copy data from decoder.
    for (var i = 0; i < numValues; i++) {
      geometryBuffer[attributeName][i] = attributeData.GetValue(i);
    }
    // Add attribute to THREEJS geometry for rendering.
    geometry.setAttribute(
      attributeName,
      new TypedBufferAttribute(geometryBuffer[attributeName], numComponents)
    );
    dracoDecoder.destroy(attributeData);
  },

  convertDracoGeometryTo3JS: function (
    dracoDecoder,
    decoder,
    geometryType,
    buffer,
    attributeUniqueIdMap,
    attributeTypeMap
  ) {
    // TODO: Should not assume native Draco attribute IDs apply.
    if (this.getAttributeOptions("position").skipDequantization === true) {
      decoder.SkipAttributeTransform(dracoDecoder.POSITION);
    }
    var dracoGeometry;
    var decodingStatus;
    // var start_time = performance.now();
    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      dracoGeometry = new dracoDecoder.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(buffer, dracoGeometry);
    } else {
      dracoGeometry = new dracoDecoder.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(buffer, dracoGeometry);
    }
    if (!decodingStatus.ok() || dracoGeometry.ptr == 0) {
      var errorMsg = "THREE.DRACOLoader: Decoding failed: ";
      errorMsg += decodingStatus.error_msg();
      console.error(errorMsg);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMsg);
    }

    // var decode_end = performance.now();
    dracoDecoder.destroy(buffer);
    /*
     * Example on how to retrieve mesh and attributes.
     */
    var numFaces;
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      numFaces = dracoGeometry.num_faces();
      if (this.verbosity > 0) {
        console.log("Number of faces loaded: " + numFaces.toString());
      }
    } else {
      numFaces = 0;
    }

    var numPoints = dracoGeometry.num_points();
    var numAttributes = dracoGeometry.num_attributes();
    if (this.verbosity > 0) {
      console.log("Number of points loaded: " + numPoints.toString());
      console.log("Number of attributes loaded: " + numAttributes.toString());
    }

    // Verify if there is position attribute.
    // TODO: Should not assume native Draco attribute IDs apply.
    var posAttId = decoder.GetAttributeId(dracoGeometry, dracoDecoder.POSITION);
    if (posAttId == -1) {
      var errorMsg = "THREE.DRACOLoader: No position attribute found.";
      console.error(errorMsg);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMsg);
    }
    var posAttribute = decoder.GetAttribute(dracoGeometry, posAttId);

    // Structure for converting to THREEJS geometry later.
    var geometryBuffer = {};
    // Import data to Three JS geometry.
    var geometry = new THREE.BufferGeometry();

    // Do not use both the native attribute map and a provided (e.g. glTF) map.
    if (attributeUniqueIdMap) {
      // Add attributes of user specified unique id. E.g. GLTF models.
      for (var attributeName in attributeUniqueIdMap) {
        var attributeType = attributeTypeMap[attributeName];
        var attributeId = attributeUniqueIdMap[attributeName];
        var attribute = decoder.GetAttributeByUniqueId(
          dracoGeometry,
          attributeId
        );
        this.addAttributeToGeometry(
          dracoDecoder,
          decoder,
          dracoGeometry,
          attributeName,
          attributeType,
          attribute,
          geometry,
          geometryBuffer
        );
      }
    } else {
      // Add native Draco attribute type to geometry.
      for (var attributeName in this.nativeAttributeMap) {
        var attId = decoder.GetAttributeId(
          dracoGeometry,
          dracoDecoder[this.nativeAttributeMap[attributeName]]
        );
        if (attId !== -1) {
          if (this.verbosity > 0) {
            console.log("Loaded " + attributeName + " attribute.");
          }
          var attribute = decoder.GetAttribute(dracoGeometry, attId);
          this.addAttributeToGeometry(
            dracoDecoder,
            decoder,
            dracoGeometry,
            attributeName,
            Float32Array,
            attribute,
            geometry,
            geometryBuffer
          );
        }
      }
    }

    // For mesh, we need to generate the faces.
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      if (this.drawMode === THREE.TriangleStripDrawMode) {
        var stripsArray = new dracoDecoder.DracoInt32Array();
        var numStrips = decoder.GetTriangleStripsFromMesh(
          dracoGeometry,
          stripsArray
        );
        geometryBuffer.indices = new Uint32Array(stripsArray.size());
        for (var i = 0; i < stripsArray.size(); ++i) {
          geometryBuffer.indices[i] = stripsArray.GetValue(i);
        }
        dracoDecoder.destroy(stripsArray);
      } else {
        var numIndices = numFaces * 3;
        geometryBuffer.indices = new Uint32Array(numIndices);
        var ia = new dracoDecoder.DracoInt32Array();
        for (var i = 0; i < numFaces; ++i) {
          decoder.GetFaceFromMesh(dracoGeometry, i, ia);
          var index = i * 3;
          geometryBuffer.indices[index] = ia.GetValue(0);
          geometryBuffer.indices[index + 1] = ia.GetValue(1);
          geometryBuffer.indices[index + 2] = ia.GetValue(2);
        }
        dracoDecoder.destroy(ia);
      }
    }

    geometry.drawMode = this.drawMode;
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      geometry.setIndex(
        new (geometryBuffer.indices.length > 65535
          ? THREE.Uint32BufferAttribute
          : THREE.Uint16BufferAttribute)(geometryBuffer.indices, 1)
      );
    }

    // TODO: Should not assume native Draco attribute IDs apply.
    // TODO: Can other attribute types be quantized?
    var posTransform = new dracoDecoder.AttributeQuantizationTransform();
    if (posTransform.InitFromAttribute(posAttribute)) {
      // Quantized attribute. Store the quantization parameters into the
      // THREE.js attribute.
      geometry.attributes["position"].isQuantized = true;
      geometry.attributes["position"].maxRange = posTransform.range();
      geometry.attributes[
        "position"
      ].numQuantizationBits = posTransform.quantization_bits();
      geometry.attributes["position"].minValues = new Float32Array(3);
      for (var i = 0; i < 3; ++i) {
        geometry.attributes["position"].minValues[i] = posTransform.min_value(
          i
        );
      }
    }
    dracoDecoder.destroy(posTransform);
    dracoDecoder.destroy(decoder);
    dracoDecoder.destroy(dracoGeometry);

    // this.decode_time = decode_end - start_time;
    // this.import_time = performance.now() - decode_end;

    // if (this.verbosity > 0) {
    //   console.log('Decode time: ' + this.decode_time);
    //   console.log('Import time: ' + this.import_time);
    // }
    return geometry;
  },

  isVersionSupported: function (version, callback) {
    callback(decoder.isVersionSupported(version));
  },

  getAttributeOptions: function (attributeName) {
    if (typeof this.attributeOptions[attributeName] === "undefined")
      this.attributeOptions[attributeName] = {};
    return this.attributeOptions[attributeName];
  },
};
