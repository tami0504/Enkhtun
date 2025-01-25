const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const dbConfig = require("./config/dbconfig");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");

const TOKEN_SECRET ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
// body-parser-г ашиглана
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Шинэ Pool объект үүсгэх
const pool = new Pool(dbConfig);
app.use(cors());
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to the filename
  },
});

const upload = multer({ storage });


app.get("/message", (req, res) => {
  res.json({ message: "Hello from server!" });
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const role_id = 1;
  const created_at = new Date();

  try {
    const userExistsQuery = "SELECT * FROM users WHERE email = $1";
    const userExistsValues = [email];

    const existingUser = await pool.query(userExistsQuery, userExistsValues);
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }
    if (existingUser.rows.length === 1) {
      console.log("Имэйл хаягийг өмнө нь бүртгэсэн байна: " + email);
      return res
        .status(400)
        .json({ error: "Имэйл хаягийг өмнө нь бүртгэсэн байна" });
    }

    // Нууц үгийг хэшлэх
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const insertUserQuery =
      "INSERT INTO users (name, email, password, role_id, created_at) VALUES ($1, $2, $3, $4, $5)";
    const insertUserValues = [name, email, hashedPassword, role_id, created_at]; // hashedPassword-г хадгалах

    await pool.query(insertUserQuery, insertUserValues);

    console.log("Нэвтрэх: " + email);
  
    return res.json();
  } catch (error) {
    console.error("Алдаа гарлаа:", error);
    return res.status(500).json({ error: "Серверт алдаа гарлаа" });
  }
});


// Нэвтрэх
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const query = `
    SELECT users.user_id, users.name, users.email, users.password, roles.role_name 
    FROM users 
    JOIN roles ON users.role_id = roles.role_id 
    WHERE users.email = $1
  `;
  const values = [email];

  pool.query(query, values, (err, resp) => {
    if (err) {
      console.error(err.stack);
      return res.status(500).json({ error: "Серверийн алдаа" });
    } else {
      if (resp.rows.length > 0) {
        const user = resp.rows[0];
        bcrypt.compare(password, user.password, (err, result) => {
          if (err || !result) {
            if (!result) {
              console.log("Нууц үг буруу байна: " + email);
            } else {
              console.error(err.stack);
            }
            return res
              .status(401)
              .json({ error: "Буруу нэвтрэх нэр эсвэл нууц үг" });
          }
          console.log("Нэвтрэх: " + email);

          // Token үүсгэх
          const token = jwt.sign(
            { userId: user.user_id, email: email }, 
            TOKEN_SECRET, 
            { expiresIn: "1h" }
          );
          return res.json({ 
            token: token , 
            role: user.role_name , 
            userId: user.user_id 
          });
        });
      } else {
        console.log("Хэрэглэгч олдсонгүй: " + email);
        return res
          .status(401)
          .json({ error: "Буруу нэвтрэх нэр эсвэл нууц үг" });
      }
    }
  });
});



// Токенг шалгах middleware
function verifyToken(req, res, next) {
  const token = req.headers["authorization"]; // Токеныг хүлээж авах header
  if (!token) {
    return res.status(403).json({ error: "Токен алга" }); // Токен алга бол 403 алдаа гаргах
  }

  // Токеныг зөв форматтай эсэхийг шалгах
  const tokenParts = token.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return res.status(403).json({ error: "Токен формат буруу байна" });
  }

  jwt.verify(tokenParts[1], TOKEN_SECRET, (err, decoded) => {
    // Токеныг шалгана
    if (err) {
      console.error("Token verification error:", err); // Токеныг шалгахад алдаа гарсан тохиолдолд алдааны мэдээллийг лог дээр хэвлэх
      return res.status(500).json({ error: "Токен шалгахад алдаа гарлаа" }); // Токеныг шалгахад алдаа гарсан тохиолдолд 500 алдаа гаргах
    }
    req.user = decoded; // Токеныг шалгасан хэрэглэгчийн мэдээллийг хадгалах
    next(); // Тухайн middleware-г ахин дуудах
  });
}


app.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});



app.post('/logout', verifyToken, (req, res) => {
  const token = req.headers['authorization'];
  client.set(token, 'blacklisted', 'EX', 3600, (err, reply) => {
    if (err) {
      console.error('Redis error:', err);
      return res.status(500).json({ error: 'Серверийн алдаа' });
    }
    res.json({ message: 'Амжилттай гарлаа' });
  });
});


// Хэрэглэгчийн мэдээллийг засах
app.post("/update", async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    // Hash the new password before updating
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const query = "UPDATE users SET password = $1 WHERE email = $2";
    const values = [hashedPassword, email];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      console.log("Хэрэглэгч олдсонгүй: " + email);
      return res
        .status(404)
        .json({ error: "Тухайн имэйл хаягтай хэрэглэгч олдсонгүй" });
    } else {
      console.log("Хэрэглэгчийн нууц үг амжилттай шинэчлэгдлээ: " + email);
      return res.json({ message: "Нууц үг амжилттай шинэчлэгдлээ" });
    }
  } catch (error) {
    console.error("Error updating password:", error);
    return res.status(500).json({ error: "Серверт алдаа гарлаа" });
  }
});





const authenticateUser = (req, res, next) => {
  let jwtId, jwtUsername;

  const {authorization} = req.headers;
  // see if there are authorization headers present
  if (!authorization) {
      return res.status(401).json({error: "No authorization header sent"});
  }
  // payload is the JWT
  const token = authorization.split(' ')[1];
  // TODO add this to all routes, and confirm that the decoded jwt ID is equal to the ID of the tasklist's user they are trying to edit
  // verify JWT present
  jwt.verify(
      token,
      process.env.JWT_SECRET,
      async (err, decoded) => {
          if (err)
              return res.status(401).json({error: 'Unable to verify token'});
          jwtId = decoded.id;
          jwtUsername = decoded.username;
          next();
      }
  );
};



// Feedback мэдээллийг хадгалах
app.post("/feedback", async (req, res) => {
  const { user_id, title, details } = req.body;
  
  try {
    const insertFeedbackQuery =
      "INSERT INTO feedback (user_id, title, details) VALUES ($1, $2, $3)";
    const insertFeedbackValues = [user_id, title, details];
    await pool.query(insertFeedbackQuery, insertFeedbackValues);

    console.log("Feedback submitted successfully");
    return res.json({ message: "Feedback submitted successfully" });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Feedback мэдээллийг хадгалах
app.get("/feedback", async (req, res) => {
  try {
    const query = "SELECT feedback.*, users.name AS user_name FROM feedback INNER JOIN users ON feedback.user_id = users.user_id";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Алдаа гарлаа:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});


////////////////////////////////////
// Шинэ ажил нэмэх API энд бичнэ
app.post("/jobs/add", async (req, res) => {
  const {
    job_title,
    education,
    profession,
    requirements,
    start_date,
    end_date,
  } = req.body;
  try {
    if (
      !job_title ||
      !education ||
      !profession ||
      !requirements ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({ error: "Бүх талбарыг бөглөнө үү" });
    }

    const query =
      "INSERT INTO jobs (job_title, education, profession, requirements, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)";
    const values = [
      job_title,
      education,
      profession,
      requirements,
      start_date,
      end_date,
    ];
    await pool.query(query, values);
    res.json({ message: "Ажил амжилттай нэмэгдлээ" });
  } catch (error) {
    console.error("Error adding job:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});

// Шинэ ажилын зар нэмэх үйлдэлээс өмнө бүх ажилыг авах
app.get("/jobs", async (req, res) => {
  try {
    const query = "SELECT * FROM jobs";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});

app.delete("/jobs/:id", async (req, res) => {
  const jobId = BigInt(req.params.id);
  try {
    const result = await pool.query("DELETE FROM jobs WHERE job_id = $1", [
      jobId,
    ]);
    console.log(jobId);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/jobs/:id", async (req, res) => {
  const jobId = BigInt(req.params.id);
  const {
    job_title,
    education,
    profession,
    requirements,
    start_date,
    end_date,
  } = req.body;
  try {
    if (
      !job_title ||
      !education ||
      !profession ||
      !requirements ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({ error: "Мэдээллийн ачаалал буруу байна" });
    }
    const result = await pool.query(
      "UPDATE jobs SET job_title=$1, education=$2, profession=$3, requirements=$4, end_date=$5, start_date=$6 WHERE job_id = $7",
      [
        job.job_title,
        job.education,
        job.profession,
        job.requirements,
        job.end_date,
        job.start_date,
        jobId,
      ]
    );

    console.log(jobId);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json({ message: "Job updated successfully" });
  } catch (error) {
    console.error("Error updating job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/jobs/search/:id", async (req, res) => {
  const jobId = req.params.id; // Ажилын ID-г авах

  try {
    // Ажилын мэдээллийг дуудах query
    const query = "SELECT * FROM jobs WHERE job_id = $1"; // "id" гэсэн бичлэгийг "job_id" болгож өөрчилнэ
    const result = await pool.query(query, [jobId]);

    // Ажил олсон бол мэдээллийг хариултанд буцаах
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Ажил олдохгүй бол 404 алдаа гаргах
      res.status(404).json({ error: "Ажил олдохгүй байна" });
    }
  } catch (error) {
    // Алдаа гарсан тохиолдолд 500 алдаа гаргах
    console.error("Error fetching tender:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});

////////////////////////////////////

// Тендерийн материал оруулах эндпойнт
app.post("/tenders/add", async (req, res) => {
  const {
    tname,
    start_date,
    end_date,
    is_foreign_tender,
    is_previously_announced,
    details,
  } = req.body;

  try {
    if (
      !tname ||
      !start_date ||
      !end_date ||
      !is_foreign_tender ||
      !is_previously_announced ||
      !details
    ) {
      return res.status(400).json({ error: "Мэдээллийн ачаалал буруу байна" });
    }
    const query =
      "INSERT INTO tenders (tname, start_date, end_date, is_foreign_tender, is_previously_announced, details) VALUES ($1, $2, $3, $4, $5, $6)";
    const values = [
      tname,
      start_date,
      end_date,
      is_foreign_tender,
      is_previously_announced,
      details,
    ];
    await pool.query(query, values);
    res.json({ message: "Ажил амжилттай нэмэгдлээ" });
  } catch (error) {
    console.error("Error adding job:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});

// Шинэ tender нэмэх үйлдэлээс өмнө бүх ажилыг авах
app.get("/tenders", async (req, res) => {
  try {
    const query = "SELECT * FROM tenders";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});
app.get("/tenders/:id", async (req, res) => {
  const tenderId = req.params.id; // Тендерийн ID-г авах

  try {
    // Тендерийн мэдээллийг дуудах query
    const query = "SELECT * FROM tenders WHERE id = $1";
    const result = await pool.query(query, [tenderId]);

    // Тендер олсон бол мэдээллийг хариултанд буцаах
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Тендер олдохгүй бол 404 алдаа гаргах
      res.status(404).json({ error: "Тендер олдохгүй байна" });
    }
  } catch (error) {
    // Алдаа гарсан тохиолдолд 500 алдаа гаргах
    console.error("Error fetching tender:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});

////////////////////////////////
//projects

app.get("/projects", async (req, res) => {
  try {
    const query = "SELECT * FROM projects";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "серверийн алдаа" });
  }
});














app.post('/citizens', async (req, res) => {
  const {
    user_id,
    job_id,
    RD,
    Citizenship,
    uOvog,
    parentsName,
    birthday,
    birthplace_aimag,
    birthplace_sum,
    birthplace_details,
    conditions,
    ethnicity,
    gender,
    phoneNum,
    photo,
    residence_aimag,
    residence_sum,
    residence_bagHoroo,
    residence_address,
    uNer,
  } = req.body;

  try {
    // PostgreSQL-д мэдээллийг оруулах
    const result = await pool.query(
      `INSERT INTO citizen_info (user_id, job_id, RD, Citizenship, uOvog, parentsName, birthday, birthplace_aimag, birthplace_sum, birthplace_details, conditions, ethnicity, gender, phoneNum, photo, residence_aimag, residence_sum, residence_bagHoroo, residence_address, uNer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        user_id,
        job_id,
        RD,
        Citizenship,
        uOvog,
        parentsName,
        birthday,
        birthplace_aimag,
        birthplace_sum,
        birthplace_details,
        conditions,
        ethnicity,
        gender,
        phoneNum,
        photo,
        residence_aimag,
        residence_sum,
        residence_bagHoroo,
        residence_address,
        uNer,
      ]
    );

    res.json({ message: 'Мэдээлэл амжилттай хадгалагдлаа.' });
  } catch (error) {
    console.error('Алдаа:', error);
    res.status(500).json({ error: 'Алдаа гарлаа. Мэдээллийг хадгалахад алдаа гарлаа.' });
  }
});


app.get('/citizens/by_job/:jobId', async (req, res) => {
  const jobId = req.params.jobId;

  try {
    const result = await pool.query(
      `SELECT citizen_info.*, users.user_id
       FROM citizen_info
       INNER JOIN users ON citizen_info.user_id = users.user_id
       WHERE citizen_info.job_id = $1`,
      [jobId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Алдаа:', error);
    res.status(500).json({ error: 'Мэдээллийг авахад алдаа гарлаа.' });
  }
});


app.post('/tender_applications', upload.single('company_about'), async (req, res) => {
  try {
    const { tender_id, user_id, company_name, price_quote } = req.body;
    const company_about = req.file ? req.file.filename : null;

    if (!tender_id || !user_id || !company_name || !price_quote || !company_about) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      'INSERT INTO tender_applications (tender_id, user_id, company_name, company_about, price_quote) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tender_id, user_id, company_name, company_about, price_quote]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating tender application:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});











app.post('/notifications', async (req, res) => {
  const { title, details, notilink } = req.body;

  if (!title || !details ) {
      return res.status(400).json({ error: 'Title and details are required' });
  }

  try {
      // Get all users except those with 'admin' role
      const usersResult = await pool.query(`
          SELECT user_id FROM users 
          WHERE role_id = (SELECT role_id FROM roles WHERE role_name != 'admin')
      `);

      const users = usersResult.rows;

      if (users.length === 0) {
          return res.status(404).json({ error: 'No users found' });
      }
      // Insert notifications for all non-admin users
      const insertQueries = users.map(user => {
          return pool.query(
              `INSERT INTO notifications (user_id, title, details, notilink) VALUES ($1, $2, $3, $4)`,
              [user.user_id, title, details, notilink]
          );
      });

      await Promise.all(insertQueries);

      res.status(201).json({ message: 'Notifications created successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/notifications/user/:userId", async (req, res) => {
  const userId = req.params.userId; // userId-г авах

  try {
    // userId-тай холбоотой мэдээллийг дуудах query
    const query = "SELECT * FROM notifications WHERE user_id = $1";
    const result = await pool.query(query, [userId]);

    // userId-тай холбоотой мэдээллийг хариултанд буцаах
    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      // userId-тай холбоотой мэдээлэл олдохгүй бол 404 алдаа гаргах
      res.status(404).json({ error: "Холбоотой мэдээлэл олдохгүй байна" });
    }
  } catch (error) {
    // Алдаа гарсан тохиолдолд 500 алдаа гаргах
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Серверийн алдаа" });
  }
});


module.exports = app;
