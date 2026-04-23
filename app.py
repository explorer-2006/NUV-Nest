from flask import Flask, request, redirect, flash, render_template, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, LoginManager, logout_user, login_user, current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, EmailField, SubmitField, SelectField
from wtforms.validators import DataRequired, Email, Length
from werkzeug.security import generate_password_hash, check_password_hash
import os
import re
from datetime import datetime, timezone


app = Flask(__name__, template_folder="templates")   #instance
app.secret_key = "supersecretkeythatnooneissupposetoknow"    #setting up the secret key for csrf protection
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///UserRecords.db"   

db = SQLAlchemy(app)
login_manager = LoginManager(app)      #setting up loginmanager and telling it which app to manage 
login_manager.login_view = "login"     #if user not logged in will redirect to login page



# ── School → Branch mapping ──
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

# ── User Model ──
class User(db.Model, UserMixin):
    __tablename__ = 'user'
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    enrollno = db.Column(db.String(20), nullable=False)
    email    = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.Text, nullable=False)
    school   = db.Column(db.String(10), nullable=False)
    branch   = db.Column(db.String(100), nullable=False)
    semester = db.Column(db.Integer, nullable=False, default=1)

    # Relationship: User has many Orders
    orders = db.relationship('Order', backref='user', lazy=True,
                             cascade='all, delete-orphan')


# ── Canteen Models (SQLAlchemy) ──
class Order(db.Model):
    __tablename__ = 'orders'

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    total_amount  = db.Column(db.Integer, nullable=False)
    time_slot     = db.Column(db.String(50), nullable=False)
    canteen_id    = db.Column(db.String(10), nullable=False, default='')
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    items = db.relationship('OrderItem', backref='order', lazy=True,
                            cascade='all, delete-orphan')


class OrderItem(db.Model):
    __tablename__ = 'order_items'

    id         = db.Column(db.Integer, primary_key=True)
    order_id   = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    item_name  = db.Column(db.String(100), nullable=False)
    price      = db.Column(db.Integer, nullable=False)
    quantity   = db.Column(db.Integer, nullable=False)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# Make user available in ALL templates without needing to pass explicitly each time
@app.context_processor
def inject_user():
    return dict(user=current_user)


# ── Forms ──
class RegistrationForm(FlaskForm):   # setting up the class for the registration page 
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

class LoginForm(FlaskForm):    #setting up the class for the login page
    email    = EmailField("Email", validators=[DataRequired(), Email()])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=6, max=12)])
    submit   = SubmitField("Login")

# ── Helper: render both forms together ──
def render_auth(active_form="login"):  
    return render_template(
        "auth.html",
        login_form=LoginForm(),
        register_form=RegistrationForm(),
        active_form=active_form
    )


# ── Routes ──
@app.route("/", methods=["GET", "POST"])
def register():
    form = RegistrationForm()     #create an object for the registration class

    if request.method == "GET":   #if request is get it will return the registration page
        return render_auth(active_form="register")

    elif request.method == "POST": #elif request is post 
        if form.validate_on_submit():    #will execute if all the fields are validated
            school = request.form.get("school")  #get data 
            branch = request.form.get("branch")

            if not school or not branch:
                flash("Please select your school and program.")
                return render_auth(active_form="register")

            if school not in SCHOOL_BRANCHES or branch not in SCHOOL_BRANCHES[school]: #this code is to verify that the school and branch exists and there was no misconduct from the client side
                flash("Invalid school or program selected.")
                return render_auth(active_form="register")

            existing_user = User.query.filter_by(email=form.email.data).first() 
            if existing_user:
                flash("An account with this email already exists.")
                return render_auth(active_form="register")

            
            hashed_pw = generate_password_hash(form.password.data)  #to generate hash password
            new_user = User(                       #object to store data which user entered in the registration page
                username=form.username.data,
                enrollno=form.enrollno.data,
                email=form.email.data,
                password=hashed_pw,
                school=school,
                branch=branch,
                semester=int(form.semester.data)  
            )
            db.session.add(new_user)                #store data in the database
            db.session.commit()
            flash("Account created! Please log in.")
            return redirect(url_for("login"))
        else:
            return render_auth(active_form="register")


@app.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()                  #create object for the class

    if request.method == "GET":          #if request is get 
        return render_auth(active_form="login")

    elif request.method == "POST":       #if request is post 
        if form.validate_on_submit():     #check if all the data is validated
            logged_in_user = User.query.filter_by(email=form.email.data).first()    #gets userdata from the table
            if logged_in_user and check_password_hash(logged_in_user.password, form.password.data):     #verify the user data
                login_user(logged_in_user)
                return redirect(url_for("dashboard"))
            else:
                flash("Invalid email or password.")      #if data entered doesnot match it will flash an error
                return render_auth(active_form="login")
        else:
            return render_auth(active_form="login")


@app.route("/dashboard")
@login_required                                         #protected page
def dashboard():
    return render_template("dashboard.html", user=current_user)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.")
    return redirect(url_for("login"))

# 1. Render chatbot page
@app.route("/chatbot")
@login_required
def chatbot():
    return render_template("chatbot.html", user=current_user)


# ── Campus page routes ────────────────────────────────────────────────────────

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

@app.route('/checkout')
def checkout_page():
    canteen = request.args.get('canteen', '1')
    return render_template('checkout.html', canteen=canteen, active='canteen')

@app.route('/past-orders')
@login_required
def past_orders():
    return render_template('past-orders.html')


# ── Menu image parser ─────────────────────────────────────────────────────────
VALID_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}

CATEGORY_RULES = {
    'main_cafe': [
        ('breakfast', ['paratha', 'poha', 'upma', 'idli', 'bread', 'handvo', 'masala oats', 'sabudana vada', 'wraps', 'khichu', 'masala noodles', 'masala noodles with cheese']),
        ('lunch',     ['dish', 'thali', 'dal', 'pav bhaji', 'chole', 'punjabi']),
        ('snacks',    ['samosa', 'dabeli', 'vadapav', 'sandwich', 'burger', 'pizza', 'fries', 'toast', 'grill', 'bhel', 'nachos', 'panini', 'salad', 'soup', 'tikki', 'bun']),
        ('dinner',    ['noodles', 'rice', 'manchurian', 'chilli paneer', 'paneer chilli', 'fried rice']),
        ('beverages', ['water', 'juice', 'lime', 'fresh lime', 'tea', 'coffee', 'cold coffee']),
    ],
    'tea_post': [
        ('hot',       ['tea', 'chai', 'coffee', 'bournvita', 'chocolate', 'cappuccino', 'mocha', 'latte', 'irish', 'kavo', 'green tea', 'elaichi tea']),
        ('cold',      ['cold coffee', 'milkshake', 'mojito', 'lemonade', 'soda', 'punch', 'lemon', 'kala khatta', 'chili mango', 'cold bournvita', 'cold coco', 'iced', 'smoothie']),
        ('bites',     ['khari', 'nankhatai', 'biscuit', 'puff', 'samosa', 'bread', 'bun', 'toast']),
    ],
    'bistro': [
        ('snacks',    ['burger', 'pizza', 'fries', 'sandwich', 'panini', 'nachos', 'tikki']),
        ('pasta',     ['pasta', 'spaghetti', 'penne', 'macaroni']),
        ('beverages', ['juice', 'soda', 'mojito', 'lemonade', 'smoothie', 'cold coffee', 'milkshake']),
    ],
}

def assign_category(name_lower, canteen):
    rules = CATEGORY_RULES.get(canteen, [])
    for category, keywords in rules:
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
CANTEEN_PARAM_MAP = {
    '1': 'main_cafe',
    '2': 'tea_post',
    '3': 'bistro',
}

@app.route('/api/menu')
def api_menu():
    images_dir = os.path.join(app.static_folder, 'images')

    canteen_param  = request.args.get('canteen')
    canteen_filter = CANTEEN_PARAM_MAP.get(canteen_param)

    items = []
    for canteen in sorted(os.listdir(images_dir)):
        canteen_path = os.path.join(images_dir, canteen)
        if not os.path.isdir(canteen_path):
            continue
        if canteen_filter and canteen != canteen_filter:
            continue
        for filename in sorted(os.listdir(canteen_path)):
            _, outermost_ext = os.path.splitext(filename)
            if outermost_ext.lower() not in VALID_EXTENSIONS:
                continue
            parsed = parse_filename(filename)
            if parsed is None:
                continue
            name, price = parsed
            category = assign_category(name.lower(), canteen)
            items.append({
                'name':     name,
                'price':    price,
                'category': category,
                'canteen':  canteen,
                'image':    f'images/{canteen}/{filename}',
            })
    return jsonify(items)


@app.route('/api/order', methods=['POST'])
@login_required
def place_order():
    data = request.get_json()

    # DEBUG: Log what we received
    app.logger.info(f"[place_order] User {current_user.id} sent: {data}")

    if not data:
        app.logger.warning("[place_order] No data provided")
        return jsonify({'error': 'No data provided'}), 400

    items = data.get('items', [])
    if not items or not isinstance(items, list):
        app.logger.warning("[place_order] Invalid items")
        return jsonify({'error': 'Items must be a non-empty list'}), 400

    # Process items — CONVERT strings to integers (frontend sends strings!)
    processed_items = []
    calculated_total = 0

    for i, item in enumerate(items):
        name = item.get('name', '')

        # LENIENT: Try to convert price/qty to int, accept strings too
        try:
            price = int(item.get('price', 0))
            qty = int(item.get('qty', item.get('quantity', 0)))
        except (ValueError, TypeError):
            app.logger.warning(f"[place_order] Item {i}: invalid price/qty — {item}")
            return jsonify({'error': f'Item {i}: price and qty must be numbers'}), 400

        if price <= 0 or qty <= 0:
            app.logger.warning(f"[place_order] Item {i}: non-positive values")
            return jsonify({'error': f'Item {i}: price and qty must be positive'}), 400

        if not name:
            return jsonify({'error': f'Item {i}: name is required'}), 400

        processed_items.append({'name': name, 'price': price, 'qty': qty})
        calculated_total += price * qty

    # LENIENT: Convert total to int
    try:
        total = int(data.get('total', 0))
    except (ValueError, TypeError):
        app.logger.warning("[place_order] Invalid total")
        return jsonify({'error': 'Total must be a number'}), 400

    if total <= 0:
        return jsonify({'error': 'Total must be positive'}), 400

    # LENIENT: Allow small discrepancy (platform fees, tax, rounding up to ₹10)
    if abs(total - calculated_total) > 10:
        app.logger.warning(f"[place_order] Total mismatch: calc={calculated_total}, sent={total}")
        # Use the larger of the two (trust frontend if they added fees)
        total = max(total, calculated_total)

    time_slot = data.get('time_slot', '')
    if not time_slot:
        return jsonify({'error': 'Time slot is required'}), 400

    canteen_id = str(data.get('canteen_id', '1'))

    try:
        order = Order(
            user_id=current_user.id,
            total_amount=total,
            time_slot=time_slot,
            canteen_id=canteen_id
        )
        db.session.add(order)
        db.session.flush()

        for item in processed_items:
            db.session.add(OrderItem(
                order_id=order.id,
                item_name=item['name'],
                price=item['price'],
                quantity=item['qty']
            ))

        db.session.commit()

        app.logger.info(f"[place_order] SUCCESS: Order {order.id} for user {current_user.id}")

        return jsonify({
            'message': 'Order placed successfully',
            'order_id': order.id,
            'success': True
        }), 201

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"[place_order] FAILED: {str(e)}")
        return jsonify({'error': 'Server error. Please try again.'}), 500


# This avoids type mismatch issues and is more secure
@app.route('/api/orders', methods=['GET'])
@login_required
def get_orders():
    """Fetch orders for the currently logged-in user."""
    try:
        orders = Order.query.filter_by(user_id=current_user.id)\
                            .order_by(Order.created_at.desc()).all()

        result = []
        for order in orders:
            result.append({
                'order_id':   order.id,
                'total':      order.total_amount,
                'time_slot':  order.time_slot,
                'canteen_id': order.canteen_id,
                'created_at': order.created_at.strftime('%Y-%m-%d %H:%M:%S') if order.created_at else None,
                'items': [
                    {
                        'name':  item.item_name,
                        'price': item.price,
                        'qty':   item.quantity,
                    }
                    for item in order.items
                ],
            })

        return jsonify(result)

    except Exception as e:
        app.logger.error(f"Failed to fetch orders: {str(e)}")
        return jsonify({'error': 'Failed to fetch orders'}), 500


# Keep old endpoint for backward compatibility (redirects to new one)
@app.route('/api/orders/<user_id>', methods=['GET'])
@login_required
def get_orders_legacy(user_id):
    """Legacy endpoint — redirects to new /api/orders if user_id matches current user."""
    if str(current_user.id) != str(user_id):
        return jsonify({'error': 'Unauthorized'}), 403
    # Delegate to the new endpoint
    return get_orders()


# Create tables on startup regardless of how the app is launched
# (works with both `python app.py` and `flask run` / gunicorn)
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True)