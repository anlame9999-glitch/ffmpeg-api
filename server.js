const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
app.use('/outputs', express.static(outputDir));

app.get('/', (req, res) => res.send('OK'));

app.post('/render', async (req, res) => {
  try {
    const apiKey = process.env.API_KEY;
    if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: 'Sai API Key' });
    }
    const clips = req.body.clips || req.body.videos || [];
    if (!clips.length) return res.status(400).json({ error: 'Thieu clips' });

    const jobId = Date.now();
    const tempFiles = [];
    const listFilePath = path.join(__dirname, `list_${jobId}.txt`);
    let listContent = '';

    for (let i = 0; i < clips.length; i++) {
      const url = typeof clips[i] === 'string' ? clips[i] : clips[i].url;
      const tempPath = path.join(__dirname, `temp_${jobId}_${i}.mp4`);
      const response = await axios({ url, responseType: 'stream' });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      tempFiles.push(tempPath);
      listContent += `file '${tempPath}'\n`;
    }

    fs.writeFileSync(listFilePath, listContent);
    const outputFileName = `merged_${jobId}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    ffmpeg()
      .input(listFilePath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions('-c copy')
      .save(outputPath)
      .on('end', () => {
        tempFiles.forEach(f => fs.unlinkSync(f));
        fs.unlinkSync(listFilePath);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        res.json({ video_url: `${protocol}://${req.get('host')}/outputs/${outputFileName}` });
      })
      .on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000);
