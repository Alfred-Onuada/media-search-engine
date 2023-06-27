/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {config} = require("dotenv");
config();

const admin = require("firebase-admin");
const functions = require("firebase-functions/v2");
const GCloudStorage = require("@google-cloud/storage");
const GCloudVision = require("@google-cloud/vision");
const tf = require("@tensorflow/tfjs");
const use = require("@tensorflow-models/universal-sentence-encoder");
const express = require("express");
const sharp = require("sharp");
const compression = require("compression");

const app = express();
app.use(compression());

const storage = new GCloudStorage.Storage();
const vision = new GCloudVision.ImageAnnotatorClient();

admin.initializeApp();

// Load the Universal Sentence Encoder model
let model = null;

const loadModel = async () => {
  try {
    console.log("loading model");
    if (model === null) {
      model = await use.load();
    }
    console.log("Model loaded");
  } catch (error) {
    console.error("Error loading the model:", error);
    throw error;
  }
};

const createBuffer = function(file) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const readStream = file.createReadStream();

    readStream.on("data", (chunk) => {
      chunks.push(chunk);
    });

    readStream.on("error", (err) => {
      reject(err);
    });

    readStream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });
  });
};

const removeStopwords = function(str) {
  const stopwords = [
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "you're", "you've", "you'll", "you'd", "your", "yours", "yourself",
    "yourselves", "he", "him", "his", "himself", "she", "she's",
    "her", "hers", "herself", "it", "it's", "its", "itself", "they", "them",
    "their", "theirs", "themselves", "what", "which", "who", "whom", "this",
    "that", "that'll", "these", "those", "am", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "having", "do ", "does", "did",
    "doing", "a", "an", "the", "and", "but", "if", "or", "because", " as ",
    "until", "while", "of", "at", "by", "for", "with", "about", "against",
    "won", "won't", "wouldn", "wouldn't", "between", "into", "through",
    "during", "before", "after", "above", "below", "to", "from", "up", "down",
    " in ", "out", "on", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "any",
    "both", "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s",
    "t", "can", "will", "just", "don", "don't", "should", "should've", "now",
    "d", "ll", "m", "o", "re", "ve", "y", "ain", "aren", "aren't", "couldn",
    "couldn't", "didn", "didn't", "doesn", "doesn't", "hadn", "hadn't", "hasn",
    "hasn't", "haven", "haven't", "isn", "isn't", "ma",
    "mightn", "mightn't", "mustn", "mustn't", "needn", "needn't",
    "shan", "shan't", "shouldn", "shouldn't", "wasn", "wasn't", "weren",
    "weren't",
  ];

  str = str.split(" ").filter((word) => !stopwords.includes(word)).join(" ");
  return str;
};

const calculateSimilarity = async function(string1, string2) {
  try {
    // remove the useless words
    string1 = removeStopwords(string1);
    string2 = removeStopwords(string2);

    // Encode the input strings
    const embeddings = await model.embed([string1, string2]);
    const embeddingsArray = await embeddings.array();

    // Calculate the cosine similarity between the embeddings
    const similarity = tf
        .matMul([embeddingsArray[0]], tf.transpose([embeddingsArray[1]]))
        .dataSync()[0];

    // Print the similarity score
    return similarity;
  } catch (error) {
    console.log(error);
  }
};

const getResizedImage = async function(imgName, height, width) {
  const file = storage.bucket(process.env.BUCKET_NAME)
      .file(imgName);
  const fileBuffer = await createBuffer(file);

  const resizedBuffer = await sharp(fileBuffer)
      .resize(Number(width), Number(height), {
        fit: "fill",
      })
      .toBuffer();

  return resizedBuffer;
};

// Image upload trigger
exports.ImageUploadTrigger = functions
    .storage
    .onObjectFinalized({maxInstances: 5}, async (object) => {
      if (object.data.contentType.startsWith("image/")) {
        const bucket = storage.bucket(object.bucket);
        const file = bucket.file(object.data.name);

        // Get the download URL
        const fileBuffer = await createBuffer(file);

        // generate image labels
        const [result] = await vision.labelDetection(fileBuffer);
        const labels = result.labelAnnotations;

        // create the entry into firestore DB
        const doc = {
          imgId: object.data.name,
          labels: labels.map(({description, score}) => ({description, score})),
        };

        await admin.firestore()
            .collection(process.env.COLLECTION_NAME)
            .add(doc);
      }
    });

// Search handler
app.get("/search", async (req, res) => {
  const {query} = req.query;

  await loadModel();

  const imagesAndDescriptions = {};
  const snapshot = await admin.firestore()
      .collection(process.env.COLLECTION_NAME)
      .get();

  // combine the labels and create an object
  snapshot.forEach((doc) => {
    const data = doc.data();
    imagesAndDescriptions[data.imgId] = data.labels
        .map((label) => label.description)
        .join(" ");
  });

  const similarities = {};
  for (const item of Object.keys(imagesAndDescriptions)) {
    const similarity =
      await calculateSimilarity(imagesAndDescriptions[item], query);
    similarities[item] = similarity;
  }

  // filter and sort the matching items
  const matches = Object.fromEntries(
      Object.entries(similarities)
          .filter(([key, value]) => value > .3)
          .sort((a, b) => b[1] - a[1]),
  );

  const images = Object.keys(matches);
  if (images.length === 0) {
    res.status(404).json({message: "No matching image"});
    return;
  }

  res.status(200).json({message: "Retrieved", data: images});
});

// get all image names
app.get("/", async (req, res) => {
  try {
    const snapshot = await admin.firestore()
        .collection(process.env.COLLECTION_NAME)
        .get();

    const images = [];
    snapshot.forEach((doc) => images.push(doc.data().imgId));

    if (images.length === 0) {
      res.status(404).json({message: "No images found"});
      return;
    }

    res.status(200).json({message: "Retrieved", data: images});
  } catch (error) {
    res.status(500).json({message: error.message});
  }
});

// get all images data
app.get("/image/:name", async (req, res) => {
  const {name} = req.params;
  const {width, height} = req.query;

  try {
    const imageBuffer = await getResizedImage(name, width, height);

    if (!imageBuffer) {
      res.status(404).json({message: "Image not found"});
      return;
    }

    res.status(200).send(imageBuffer);
  } catch (error) {
    res.status(500).json({message: error.message});
  }
});

exports.searchImages = functions.https
    .onRequest({
      maxInstances: 5,
      timeoutSeconds: 120,
      memory: "1GiB",
      cors: ["http://localhost:4200", "https://ai-media-search.web.app"],
    }, app);

// Delete handler
