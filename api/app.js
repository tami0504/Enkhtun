const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const dbConfig = require("./dbconfig");
const cors = require("cors");
const app = express();


// body-parser-г ашиглана
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Шинэ Pool объект үүсгэх
const pool = new Pool(dbConfig);
app.use(cors());



app.get("/message", (req, res) => {
  res.json({ message: "Hello from server!" });
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userExistsQuery = 'SELECT * FROM users WHERE email = $1';
    const userExistsValues = [email];

    const existingUser = await pool.query(userExistsQuery, userExistsValues);
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (existingUser.rows.length === 1) {
      console.log('Имэйл хаягийг өмнө нь бүртгэсэн байна: ' + email);
      return res.status(400).json({ error: 'Имэйл хаягийг өмнө нь бүртгэсэн байна' });
    }

    // Hash the password before storing it in the database
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const insertUserQuery = 'INSERT INTO users(name, email, password) VALUES ($1, $2, $3)';
    const insertUserValues = [name, email, hashedPassword];

    await pool.query(insertUserQuery, insertUserValues);

    // Мэйл илгээх функц дуудах
    return res.json({ message: 'Хэрэглэгч бүртгэгдлээ' });
  } catch (error) {
    console.error('Алдаа гарлаа:', error);
    return res.status(500).json({ error: 'Серверийн дотоод алдаа' });
  }
});


// Нэвтрэх
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  // Нэвтрэх баталгаажуулах логикийг хийх
  const query = 'SELECT * FROM users WHERE email = $1'
  const values = [email]
  pool.query(query, values, (err, resp) => {
    if (err) {
      console.error(err.stack);
      return res.status(500).json({ error: 'Серверийн алдаа' });
    } else {
      if (resp.rows[0]) {
        bcrypt.compare(password, resp.rows[0]['password'], (err, result) => {
          if (err || !result) {
            if (!result) {
              console.log('Нууц үг буруу байна: ' + email);
            } else {
              console.error(err.stack);
            }
            return res.status(401).json({ error: 'Буруу нэвтрэх нэр эсвэл нууц үг' });
          }
          console.log('Нэвтрэх: ' + email);
          // Токен үүсгэх
          const token = jwt.sign({ email: email }, TOKEN_SECRET); // Токенг үүсгэх
          return res.json({ token: token }); // Токеныг хэрэглэгчид буцаана
        });
      } else {
        console.log('Хэрэглэгч олдсонгүй: ' + email);
        return res.status(401).json({ error: 'Буруу нэвтрэх нэр эсвэл нууц үг' });
      }
    }
  });
});

// Токенг шалгах middleware
function verifyToken(req, res, next) {
  const token = req.headers['authorization']; // Токеныг хүлээж авах header
  if (!token) {
    return res.status(403).json({ error: 'Токен алга' }); // Токен алга бол 403 алдаа гаргах
  }

  jwt.verify(token, TOKEN_SECRET, (err, decoded) => { // Токеныг шалгана
    if (err) {
      console.error(err.stack);
      return res.status(500).json({ error: 'Токен шалгахад алдаа гарлаа' }); // Токеныг шалгахад алдаа гарсан тохиолдолд 500 алдаа гаргах
    }
    req.user = decoded; // Токеныг шалгасан хэрэглэгчийн мэдээллийг хадгалах
    next(); // Тухайн middleware-г ахин дуудах
  });
}
// Хэрэглэгчийн мэдээллийг засах
app.post('/update', async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    // Hash the new password before updating
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const query = 'UPDATE users SET password = $1 WHERE email = $2';
    const values = [hashedPassword, email];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      console.log('Хэрэглэгч олдсонгүй: ' + email);
      return res.status(404).json({ error: 'Тухайн имэйл хаягтай хэрэглэгч олдсонгүй' });
    } else {
      console.log('Хэрэглэгчийн нууц үг амжилттай шинэчлэгдлээ: ' + email);
      return res.json({ message: 'Нууц үг амжилттай шинэчлэгдлээ' });
    }
  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: 'Серверийн дотоод алдаа' });
  }
});

// Feedback мэдээллийг хадгалах
app.post('/feedback', async (req, res) => {
  const { user_id, title, details } = req.body;

  try {
    // Insert feedback into the database
    const insertFeedbackQuery = 'INSERT INTO feedback (user_id, title, details) VALUES ($1, $2, $3)';
    const insertFeedbackValues = [user_id, title, details];
    await pool.query(insertFeedbackQuery, insertFeedbackValues);

    console.log('Feedback submitted successfully');
    return res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

////////////////////////////////////
// Шинэ ажил нэмэх API энд бичнэ
app.post('/jobs/add', async (req, res) => {
  const { job_title, education, profession, requirements, start_date, end_date } = req.body;
  try {
    if (!job_title || !education || !profession || !requirements || !start_date || !end_date) {
      return res.status(400).json({ error: 'Бүх талбарыг бөглөнө үү' });
    }
    
    const query = 'INSERT INTO jobs (job_title, education, profession, requirements, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)';
    const values = [job_title, education, profession, requirements, start_date, end_date];
    await pool.query(query, values);
    res.json({ message: 'Ажил амжилттай нэмэгдлээ' });
  } catch (error) {
    console.error('Error adding job:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

// Шинэ ажилын зар нэмэх үйлдэлээс өмнө бүх ажилыг авах
app.get('/jobs', async (req, res) => {
  try {
    const query = 'SELECT * FROM jobs';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

app.delete('/jobs/:id', async (req, res) => {
  const jobId = BigInt(req.params.id);
  try {
    const result = await pool.query('DELETE FROM jobs WHERE job_id = $1', [jobId]);
    console.log(jobId);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/jobs/:id', async (req, res) => { 
  const jobId = BigInt(req.params.id);
  const { job_title, education, profession, requirements, start_date, end_date } = req.body;
  try {
    if (!job_title || !education || !profession || !requirements || !start_date || !end_date) {
      return res.status(400).json({ error: 'Мэдээллийн ачаалал буруу байна' });
    }
    const result = await pool.query('UPDATE jobs SET job_title=$1, education=$2, profession=$3, requirements=$4, end_date=$5, start_date=$6 WHERE job_id = $7', [job.job_title, job.education, job.profession, job.requirements, job.end_date, job.start_date, jobId]);

    console.log(jobId);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/jobs/search/:id', async (req, res) => {
  const jobId = req.params.id; // Ажилын ID-г авах

  try {
    // Ажилын мэдээллийг дуудах query
    const query = 'SELECT * FROM jobs WHERE job_id = $1'; // "id" гэсэн бичлэгийг "job_id" болгож өөрчилнэ
    const result = await pool.query(query, [jobId]);

    // Ажил олсон бол мэдээллийг хариултанд буцаах
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Ажил олдохгүй бол 404 алдаа гаргах
      res.status(404).json({ error: 'Ажил олдохгүй байна' });
    }
  } catch (error) {
    // Алдаа гарсан тохиолдолд 500 алдаа гаргах
    console.error('Error fetching tender:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

////////////////////////////////////


// Тендерийн материал оруулах эндпойнт
app.post('/tenders/add', async (req, res) => {
  const { tname, start_date, end_date, is_foreign_tender, is_previously_announced, details } = req.body;
  
  try {
    if (!tname || !start_date || !end_date || !is_foreign_tender || !is_previously_announced || !details) {
      return res.status(400).json({ error: 'Мэдээллийн ачаалал буруу байна' });
    }
    const query ='INSERT INTO tenders (tname, start_date, end_date, is_foreign_tender, is_previously_announced, details) VALUES ($1, $2, $3, $4, $5, $6)';
    const values =[tname, start_date, end_date, is_foreign_tender, is_previously_announced, details]
    await pool.query(query, values);
    res.json({ message: 'Ажил амжилттай нэмэгдлээ' });
  } catch (error) {
    console.error('Error adding job:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

// Шинэ tender нэмэх үйлдэлээс өмнө бүх ажилыг авах
app.get('/tenders', async (req, res) => {
  try {
    const query = 'SELECT * FROM tenders';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});
app.get('/tenders/:id', async (req, res) => {
  const tenderId = req.params.id; // Тендерийн ID-г авах

  try {
    // Тендерийн мэдээллийг дуудах query
    const query = 'SELECT * FROM tenders WHERE id = $1';
    const result = await pool.query(query, [tenderId]);

    // Тендер олсон бол мэдээллийг хариултанд буцаах
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Тендер олдохгүй бол 404 алдаа гаргах
      res.status(404).json({ error: 'Тендер олдохгүй байна' });
    }
  } catch (error) {
    // Алдаа гарсан тохиолдолд 500 алдаа гаргах
    console.error('Error fetching tender:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

////////////////////////////////
//projects

app.get('/projects', async (req, res) => {
  try {
    const query = 'SELECT * FROM projects';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'серверийн алдаа' });
  }
});

module.exports = app;
