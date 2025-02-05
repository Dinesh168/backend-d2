"use strict";

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const createLib1Module = require("./device2.js");

const app = express();

// Enable CORS and JSON body parsing
app.use(cors());
app.use(bodyParser.json());

// Set the total size of the scanResults structure.
const SCAN_RESULTS_SIZE = 11661;

let Module; 


function createScanResultsStruct() {
  const ptr = Module._malloc(SCAN_RESULTS_SIZE);
  Module.HEAPU8.fill(0, ptr, ptr + SCAN_RESULTS_SIZE);
  return ptr;
}


/**
 * Parse the scanResults structure from WASM memory at pointer `ptr`.
 */
function parseScanResults(ptr) {
  const buffer = Module.HEAPU8.buffer;
  const dv = new DataView(buffer, ptr, SCAN_RESULTS_SIZE);
  const result = {};

  const wavelengthOffset = 216; // for pointing to the location of wavelength array in the scanResults structure
  result.wavelength = [];
  for (let i = 0; i < 864; i++) {
    result.wavelength.push(dv.getFloat64(wavelengthOffset + i * 8, true));
  }

  const intensityOffset = 7128 // for pointing to the location of intensity array in the scanResults structure
  result.intensity = [];
  for (let i = 0; i < 864; i++) {
    result.intensity.push(dv.getInt32(intensityOffset + i * 4, true));
  }

  result.length = dv.getInt32(10584, true); // ponting to the location of length in the scanResults structure

  return result;
}

function allocateBuffer(inputArray) {
  const numBytes = inputArray.length;
  const ptr = Module._malloc(numBytes);
  for (let i = 0; i < numBytes; i++) {
    Module.HEAPU8[ptr + i] = inputArray[i];
  }
  return ptr;
}

function freeBuffer(ptr) {
  Module._free(ptr);
}

// Reference array 
const Whiteref = [21137, 23461, 25891, 28367, 31858, 35725, 40924, 46440, 52308, 57973,
  62886, 66825, 70721, 75174, 78999, 82422, 85964, 89275, 93353, 96599,
  100713, 105161, 108933, 112371, 115267, 118112, 121028, 123365, 125760,
  127694, 129925, 130425, 131035, 131298, 131473, 131586, 131395, 130842,
  130745, 129883, 129153, 128387, 128404, 128387, 127712, 127662, 127881,
  127874, 128414, 128736, 129329, 129924, 130318, 131157, 131971, 132612,
  133924, 134924, 135965, 136691, 138004, 139057, 139758, 140825, 142173,
  143342, 144459, 145544, 146776, 148593, 150046, 151204, 152681, 154605,
  156582, 158549, 160960, 162883, 164648, 167251, 169406, 171161, 174277,
  176836, 178872, 180927, 183479, 185942, 187803, 190320, 192239, 195410,
  198113, 200893, 203218, 206430, 208654, 211285, 213297, 215662, 218728,
  220557, 222792, 224330, 225902, 227567, 228498, 229999, 231517, 233056,
  234025, 234663, 235577, 236015, 236411, 237219, 237254, 237840, 237650,
  237870, 236982, 236333, 235831, 235782, 236059, 235538, 235514, 234285,
  233723, 233204, 232497, 231422, 230439, 229279, 229006, 227866, 227149,
  226210, 226195, 225709, 225065, 224861, 224181, 223494, 223504, 223279,
  222945, 222369, 221616, 221556, 220294, 219572, 218417, 217293, 216454,
  214937, 214207, 212318, 211100, 209948, 208136, 205671, 204214, 203015,
  201270, 199742, 197541, 195868, 194064, 191210, 189148, 186718, 184775,
  181802, 179459, 176454, 173810, 171895, 168041, 165151, 162034, 159171,
  156523, 153588, 150959, 147928, 145076, 141260, 138624, 135162, 132316,
  129342, 126361, 123576, 120642, 116857, 113308, 110327, 106641, 103998,
  100801, 97836, 95005, 92292, 88127, 85985, 83064, 80679, 77675, 75136,
  72384, 69419, 66714, 62123, 58652, 54169, 49142, 43911, 38363, 33135,
  28273, 23826, 18769, 16145, 13679, 11572, 9997, 8607];

createLib1Module()
  .then(mod => {
    Module = mod;
    console.log("Emscripten module loaded.");

    // POST endpoint to interpret scan data.
    app.post("/scan_interpret", (req, res) => {

      
      const data = req.body;
      const name = data.fileName || "";
      const myArr = data.myArr; // Expected to be an array of byte values.
      
      // Allocate and copy the input array into WASM memory.
      const inputPtr = allocateBuffer(myArr);
      const sizeNumber = myArr.length;

      // Allocate a scanResults structure in WASM memory.
      const resultPtr = createScanResultsStruct();

      Module.ccall(
        "dlpspec_scan_interpret",
        null,
        ["number", "number", "number"],
        [inputPtr, sizeNumber, resultPtr]
      );

      let results = parseScanResults(resultPtr);
      freeBuffer(inputPtr);
      Module._free(resultPtr);


      results.wavelength = results.wavelength.slice(0, 228);
      results.intensity = results.intensity.slice(0, 228);

      if (results.intensity.length === 228 && Whiteref.length >= 228) {
        results.reflectance = results.intensity.map((i, idx) => i / Whiteref[idx]);
      } else {
        console.error("Error: intensity array length mismatch.");
        results.reflectance = [];
      }

      // Optionally, save results to CSV.
      let csvData = "wavelength,intensity,reflectance\n";
      for (let i = 0; i < results.wavelength.length; i++) {
        csvData += `${results.wavelength[i]},${results.intensity[i]},${results.reflectance[i]}\n`;
      }
      const dataDir = "C:/Users/Hp/KOSHA/node.js/data";
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const currentTime = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .slice(0, 15);
      const csvFileName = path.join(dataDir, `${name}_${currentTime}.csv`);
      fs.writeFileSync(csvFileName, csvData);
      res.json({ result: results });
    });

    app.get("/", (req, res) => {
      res.send("Hi, welcome to the DLP Nano Express API! Use the /scan_interpret endpoint to send scan data.");
    });

    const PORT = 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Failed to load the Emscripten module:", err);
  });
