const pinataSDK = require("@pinata/sdk");

console.log("PINATA JWT FOUND:", !!process.env.PINATA_JWT);
console.log("JWT LENGTH:", process.env.PINATA_JWT?.length);

const pinata = new pinataSDK({
    pinataJWTKey: process.env.PINATA_JWT
});
/**
 * Test Pinata authentication
 */
const testPinataConnection = async () => {
  try {
    const result = await pinata.testAuthentication();
    return {
      success: true,
      message: "Pinata connected successfully",
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: "Pinata authentication failed",
      error: error.message,
    };
  }
};

/**
 * Upload file to IPFS via Pinata
 * @param {Buffer} fileBuffer - file buffer from multer or fs
 * @param {string} fileName - name of file
 */
const uploadFileToPinata = async (fileBuffer, fileName) => {
  try {
    const options = {
      pinataMetadata: {
        name: fileName,
      },
      pinataOptions: {
        cidVersion: 0,
      },
    };

    const result = await pinata.pinFileToIPFS(fileBuffer, options);

    return {
      success: true,
      ipfsHash: result.IpfsHash,
      pinSize: result.PinSize,
      timestamp: result.Timestamp,
      url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
    };
  } catch (error) {
    return {
      success: false,
      message: "File upload failed",
      error: error.message,
    };
  }
};

/**
 * Upload JSON metadata (useful for NFTs / records)
 */
const uploadJSONToPinata = async (jsonData, name) => {
  try {
    const options = {
      pinataMetadata: {
        name: name,
      },
    };

    const result = await pinata.pinJSONToIPFS(jsonData, options);

    return {
      success: true,
      ipfsHash: result.IpfsHash,
      url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
    };
  } catch (error) {
    return {
      success: false,
      message: "JSON upload failed",
      error: error.message,
    };
  }
};

module.exports = {
  pinata,
  testPinataConnection,
  uploadFileToPinata,
  uploadJSONToPinata,
};