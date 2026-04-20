from flask import Flask, request, redirect, flash, render_template, url_for, jsonify, Response, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, LoginManager, logout_user, login_user, current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, EmailField, SubmitField, SelectField
from wtforms.validators import DataRequired, Email, Length
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import re
from dotenv import load_dotenv
from openai import OpenAI
from datetime import datetime


# ── App instance & config ─────────────────────────────────────────────────────
app = Flask(__name__, template_folder="templates")
app.secret_key = "supersecretkeythatnooneissupposetoknow"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///UserRecords.db"

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"   # redirect unauthenticated users to /login


# AUTH APP 


# ── School --- Branch mapping ───────────────────────────────────────────────────
SCHOOL_BRANCHES = {
    "SBL": [
        "BBA", "BBA Hons Business Analytics", "BBA LLB",
        "MBA", "LLM", "Executive MBA", "PHD"
    ],
    "SET": [
        "BCA Hons AI-ML", "BSc Data Science", "BTech CSE",
        "BTech Mechanical", "BTech Civil", "BTech EEE",
        "BSc-MSc Computer Science AI-ML", "Integrated BTech MBA",
        "MSc Computer Science Coop", "MTech Structural Engineering",
        "MTech Robotics & Automation", "MTech Computer Science Engineering", "PHD"
    ],
    "SOS": [
        "BSc Chemistry", "BSc Microbiology", "BSc Zoology and Animal Technology",
        "BSc Botany and Plant Technology", "BSc-MSc Biomedical", "BSc-MSc Botany",
        "BSc-MSc Zoology", "BSc-MSc Microbiology", "BSc-MSc Food Science",
        "BSc-MSc Analytical Chemistry", "BSc-MSc Organic Chemistry",
        "MSc Organic Chemistry", "BSc Analytical Chemistry",
        "MSc Zoology & Biotechnology", "MSc Botany & Biotechnology",
        "MSc Microbiology", "MSc Clinical Embryology",
        "MSc Medicinal & Pharmaceutical Chemistry", "MSc Food Science & Dietetics", "PHD"
    ],
    "SEDA": [
        "BDesign Interior", "BDesign Product and Visual Communication",
        "BArch", "MPlan Urban & Regional Planning"
    ],
    "SLSE": [
        "BA Journalism & Mass Communication",
        "BA Humanities & Social Sciences", "BEd", "PHD"
    ],
}

# ── User Model (SQLAlchemy) ───────────────────────────────────────────────────
class User(db.Model, UserMixin):
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    enrollno = db.Column(db.String(20), nullable=False)
    email    = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.Text, nullable=False)
    school   = db.Column(db.String(10), nullable=False)
    branch   = db.Column(db.String(100), nullable=False)
    semester = db.Column(db.Integer, nullable=False, default=1)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ── WTForms ──────────────────────────────────────────────────────────────────
class RegistrationForm(FlaskForm):
    username = StringField("Username", validators=[DataRequired(), Length(min=3, max=15)])
    enrollno = StringField("Enrollment Number", validators=[DataRequired(), Length(min=8, max=8)])
    email    = EmailField("Email", validators=[DataRequired(), Email()])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=6, max=12)])
    semester = SelectField(
        "Semester",
        choices=[(str(i), f"Semester {i}") for i in range(2, 9, 2)],
        validators=[DataRequired()]
    )
    submit   = SubmitField("Register")

class LoginForm(FlaskForm):
    email    = EmailField("Email", validators=[DataRequired(), Email()])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=6, max=12)])
    submit   = SubmitField("Login")


# ── Helper ────────────────────────────────────────────────────────────────────
def render_auth(active_form="login"):
    return render_template(
        "auth.html",
        login_form=LoginForm(),
        register_form=RegistrationForm(),
        active_form=active_form
    )


# ── Auth Routes ───────────────────────────────────────────────────────────────

# CONFLICT RESOLVED: app2 also had "/" mapped to its campus dashboard.
# app1's register page keeps "/" as it is the entry point for new users.
# app2's campus dashboard is moved to "/home"  (see Section 2).
@app.route("/", methods=["GET", "POST"])
def register():
    form = RegistrationForm()

    if request.method == "GET":
        return render_auth(active_form="register")

    elif request.method == "POST":
        if form.validate_on_submit():
            school = request.form.get("school")
            branch = request.form.get("branch")

            if not school or not branch:
                flash("Please select your school and program.")
                return render_auth(active_form="register")

            if school not in SCHOOL_BRANCHES or branch not in SCHOOL_BRANCHES[school]:
                flash("Invalid school or program selected.")
                return render_auth(active_form="register")

            existing_user = User.query.filter_by(email=form.email.data).first()
            if existing_user:
                flash("An account with this email already exists.")
                return render_auth(active_form="register")

            hashed_pw = generate_password_hash(form.password.data)
            new_user = User(
                username=form.username.data,
                enrollno=form.enrollno.data,
                email=form.email.data,
                password=hashed_pw,
                school=school,
                branch=branch,
                semester=int(form.semester.data)
            )
            db.session.add(new_user)
            db.session.commit()
            flash("Account created! Please log in.")
            return redirect(url_for("login"))
        else:
            return render_auth(active_form="register")


@app.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()

    if request.method == "GET":
        return render_auth(active_form="login")

    elif request.method == "POST":
        if form.validate_on_submit():
            logged_in_user = User.query.filter_by(email=form.email.data).first()
            if logged_in_user and check_password_hash(logged_in_user.password, form.password.data):
                login_user(logged_in_user)
                return redirect(url_for("dashboard"))
            else:
                flash("Invalid email or password.")
                return render_auth(active_form="login")
        else:
            return render_auth(active_form="login")



@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", user=current_user)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.")
    return redirect(url_for("login"))


# CONFLICT RESOLVED: both apps had "/chatbot".
# app1's version required login and passed `user=current_user`.
# app2's version was public and passed `active="chatbot"`.
# Merged into one route: if authenticated, serve the full user-aware chatbot;
# if not, still render the chatbot template in public/preview mode.
@app.route("/chatbot")
def chatbot():
    if current_user.is_authenticated:
        return render_template("chatbot.html", user=current_user, active="chatbot")
    return render_template("chatbot.html", active="chatbot")



#  CAMPUS / CANTEEN APP 


# ── Canteen SQLite helpers ────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect('canteen.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT,
            total_amount  INTEGER,
            time_slot     TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id   INTEGER,
            item_name  TEXT,
            price      INTEGER,
            quantity   INTEGER
        )
    ''')
    conn.commit()
    conn.close()


# ── Campus page routes ────────────────────────────────────────────────────────

# CONFLICT RESOLVED: app2's "/" (campus dashboard) → moved to "/home".
@app.route("/home")
def home():
    return render_template("dashboard.html", active="dashboard")

@app.route("/menu")
def menu():
    return render_template("menu.html", active="canteen")

@app.route("/canteen")
def canteen():
    return render_template("canteen.html", active="canteen")

@app.route("/campus")
def campus():
    return render_template("campus.html", active="campus")

@app.route("/attendance")
def attendance():
    return render_template("attendance.html", active="attendance")

@app.route("/about")
def about():
    return render_template("about.html", active="about")

@app.route("/contact")
def contact():
    return render_template("contact.html", active="contact")


# ── Menu image parser ─────────────────────────────────────────────────────────
VALID_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}

CATEGORY_RULES = [
    ('breakfast', ['paratha', 'poha', 'upma', 'idli', 'bread', 'roti']),
    ('lunch',     ['dish', 'thali', 'dal', 'pav bhaji', 'chole', 'punjabi']),
    ('snacks',    ['samosa', 'puff', 'dabeli', 'vadapav', 'sandwich', 'burger',
                   'pizza', 'fries', 'toast', 'grill', 'bhel', 'nachos',
                   'panini', 'salad', 'soup', 'tikki']),
    ('dinner',    ['noodles', 'rice', 'manchurian', 'chilli paneer',
                   'paneer chilli', 'fried rice']),
    ('hot',       ['tea', 'chai', 'coffee', 'bournvita', 'chocolate',
                   'cappuccino', 'mocha', 'latte', 'irish', 'kavo', 'green tea']),
    ('cold',      ['cold coffee', 'milkshake', 'mojito', 'lemonade', 'soda',
                   'punch', 'lemon', 'kala khatta', 'chili mango', 'mineral',
                   'cold bournvita', 'cold coco', 'iced', 'smoothie']),
    ('bites',     ['bun', 'khari', 'nankhatai', 'banana', 'biscuit']),
    ('beverages', ['water', 'juice', 'lime', 'fresh lime']),
]

def assign_category(name_lower):
    for category, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw in name_lower:
                return category
    return 'other'

def strip_ext(filename):
    stem = filename
    while True:
        base, ext = os.path.splitext(stem)
        if ext.lower() in VALID_EXTENSIONS:
            stem = base
        else:
            break
    return stem

def clean_name(raw):
    raw = re.sub(r'\(.*?\)', '', raw)
    raw = raw.replace('_', ' ').strip()
    raw = re.sub(r'\s+', ' ', raw)
    return raw.title()

def parse_filename(filename):
    stem  = strip_ext(filename)
    parts = stem.split('_')
    price_index = None
    for i in range(len(parts) - 1, -1, -1):
        token = parts[i].strip('.')
        if token.isdigit():
            price_index = i
            break
    if price_index is None:
        return None
    try:
        price = int(parts[price_index].strip('.'))
    except ValueError:
        return None
    name_parts = parts[:price_index]
    name_raw   = '_'.join(name_parts)
    name       = clean_name(name_raw)
    if not name:
        return None
    return name, price


# ── Canteen API routes ────────────────────────────────────────────────────────
@app.route('/api/menu')
def api_menu():
    images_dir = os.path.join(app.static_folder, 'images')
    items = []
    for canteen in sorted(os.listdir(images_dir)):
        canteen_path = os.path.join(images_dir, canteen)
        if not os.path.isdir(canteen_path):
            continue
        for filename in sorted(os.listdir(canteen_path)):
            _, outermost_ext = os.path.splitext(filename)
            if outermost_ext.lower() not in VALID_EXTENSIONS:
                continue
            parsed = parse_filename(filename)
            if parsed is None:
                continue
            name, price = parsed
            category    = assign_category(name.lower())
            items.append({
                'name':     name,
                'price':    price,
                'category': category,
                'canteen':  canteen,
                'image':    f'images/{canteen}/{filename}',
            })
    return jsonify(items)


@app.route('/api/order', methods=['POST'])
def place_order():
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO orders (user_id, total_amount, time_slot) VALUES (?, ?, ?)',
        (data['user_id'], data['total'], data['time_slot'])
    )
    order_id = cursor.lastrowid
    for item in data['items']:
        conn.execute(
            'INSERT INTO order_items (order_id, item_name, price, quantity) VALUES (?, ?, ?, ?)',
            (order_id, item['name'], item['price'], item['qty'])
        )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Order placed successfully'})


@app.route('/api/orders/<user_id>', methods=['GET'])
def get_orders(user_id):
    conn = get_db()
    orders = conn.execute(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        (user_id,)
    ).fetchall()
    result = []
    for order in orders:
        items = conn.execute(
            'SELECT * FROM order_items WHERE order_id = ?',
            (order['id'],)
        ).fetchall()
        result.append({
            'order_id':   order['id'],
            'total':      order['total_amount'],
            'time_slot':  order['time_slot'],
            'created_at': order['created_at'],
            'items': [
                {'name': i['item_name'], 'price': i['price'], 'qty': i['quantity']}
                for i in items
            ]
        })
    conn.close()
    return jsonify(result)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()   # creates UserRecords.db tables (SQLAlchemy)
    init_db()             # creates canteen.db tables (raw sqlite3)
    app.run(debug=True)