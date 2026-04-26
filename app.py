from flask import Flask, request, redirect, flash, render_template, url_for, jsonify, Response, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, LoginManager, logout_user, login_user, current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, EmailField, SubmitField, SelectField
from wtforms.validators import DataRequired, Email, Length
from werkzeug.security import generate_password_hash, check_password_hash
import os
from openai import OpenAI
from dotenv import load_dotenv
import re
import razorpay
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()   #loading the api key stored in the env file
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))  #setting up the client 


app = Flask(__name__, template_folder="templates")   #instance
app.secret_key = "supersecretkeythatnooneissupposetoknow"    #setting up the secret key for csrf protection
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///UserRecords.db"


db = SQLAlchemy(app)
login_manager = LoginManager(app)      #setting up loginmanager and telling it which app to manage 
login_manager.login_view = "login"     #if user not logged in will redirect to login page

def build_system_prompt(user):       #prompt for the system content for openai
    return f"""
You are an Kind academic elective advisor for Navrachana University (NUV).
Your ONLY job is to help students choose electives. Nothing else.

Student profile:
- Name: {user.username}
- School: {user.school}
- Program: {user.branch}
- Semester: {user.semester}

Available electives:
SBL: Business Analytics, Entrepreneurship, Digital Marketing, Finance, HR Management
SET: AI & ML, Cybersecurity, Cloud Computing, IoT, Data Science, Robotics
SOS: Bioinformatics, Environmental Science, Food Technology, Genetics
SEDA: Sustainable Design, UX/UI, Urban Planning, Heritage Conservation
SLSE: Media Studies, Psychology, Development Studies, Education Technology

Rules:
- First ask about interests and career goals before recommending
- Recommend 2-3 electives max with clear reasoning
- Only recommend electives from the student's own school
- Greet them Nicely and dont be rude also if they try to go off topic do kindly redirect them. 
- If asked something off-topic reply with:
  "I'm only here to help you choose the right electives at NUV. What are your interests or career goals?"
- Never make up electives not in the list above
"""

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
class User(db.Model, UserMixin):   #db.model tells sqlalchemy this class is a database table
    __tablename__ = 'user'    #table name in database
    id       = db.Column(db.Integer, primary_key=True)  #no 2 users have the same id
    username = db.Column(db.String(50), unique=True, nullable=False)
    enrollno = db.Column(db.String(20), nullable=False)
    email    = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.Text, nullable=False)
    school   = db.Column(db.String(10), nullable=False)
    branch   = db.Column(db.String(100), nullable=False)
    semester = db.Column(db.Integer, nullable=False, default=2)

    # One user has many Orders
    orders = db.relationship('Order', backref='user', lazy=True, #links user to order model and backref adds reverse access on order
                             cascade='all, delete-orphan') #if user is deleted, delete all their orders too
    

class Conversation(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title      = db.Column(db.String(200), default="New Chat")
    created_at = db.Column(db.DateTime, default=datetime.now)
    messages   = db.relationship('Message', backref='conversation', lazy=True, cascade="all, delete-orphan")

class Message(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    role            = db.Column(db.String(10), nullable=False)
    content         = db.Column(db.Text, nullable=False)
    created_at      = db.Column(db.DateTime, default=datetime.now)


class Conversation(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title      = db.Column(db.String(200), default="New Chat")
    created_at = db.Column(db.DateTime, default=datetime.now)
    messages   = db.relationship('Message', backref='conversation', lazy=True, cascade="all, delete-orphan")

class Message(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    role            = db.Column(db.String(10), nullable=False)
    content         = db.Column(db.Text, nullable=False)
    created_at      = db.Column(db.DateTime, default=datetime.now)

# ── Canteen Models 
class Order(db.Model):
    __tablename__ = 'orders'

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    total_amount  = db.Column(db.Integer, nullable=False)
    time_slot     = db.Column(db.String(50), nullable=False)
    canteen_id    = db.Column(db.String(10), nullable=False, default='')
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    status        = db.Column(db.String(20), default='success')   # success | failed | pending
    reason        = db.Column(db.String(255), nullable=True)      # failure reason if any
    payment_id    = db.Column(db.String(100), nullable=True)      # Razorpay payment_id

    items = db.relationship('OrderItem', backref='order', lazy=True, #links order to orderitem model and backref adds reverse access on orderitem
                            cascade='all, delete-orphan')  ##if user is deleted, delete all their orders too

class OrderItem(db.Model):
    __tablename__ = 'order_items'

    id         = db.Column(db.Integer, primary_key=True)
    order_id   = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    item_name  = db.Column(db.String(100), nullable=False)
    price      = db.Column(db.Integer, nullable=False)
    quantity   = db.Column(db.Integer, nullable=False)


@login_manager.user_loader
def load_user(user_id):  #gets user-id from the cookies stored in browser
    return User.query.get(int(user_id))  #returns user object if found else returns none


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
def render_auth(active_form="login"):   #helper function tells which form is currently active
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

            existing_user = User.query.filter_by(email=form.email.data).first() #checks if the email already exists
            if existing_user:
                flash("An account with this email already exists.")  #will show a message if user already exists
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
            flash("Account created! Please log in.")  #redirects to login page after registration
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


@app.route("/logout")   #for logout
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.")
    return redirect(url_for("login"))  #redirects back to login page

# 1. Render chatbot page        
@app.route("/chatbot")  
@login_required
def chatbot():
    return render_template("chatbot.html", user=current_user) #retuns chatbot.html


# 2. Create new conversation
@app.route("/api/chat/new", methods=["POST"])
@login_required
def new_conversation():
    conv = Conversation(user_id=current_user.id)
    db.session.add(conv)
    db.session.commit()
    return jsonify({"conversation_id": conv.id})


# 3. Get all conversations for sidebar
@app.route("/api/chat/history", methods=["GET"])
@login_required
def chat_history():
    convos = Conversation.query.filter_by(user_id=current_user.id)\
             .order_by(Conversation.created_at.desc()).all() #gets all the convo history of that user in descending order
    return jsonify([
        {"id": c.id, "title": c.title, "created_at": c.created_at.strftime("%d %b")} #returns json response to javascript
        for c in convos
    ])


# 4. Get messages for a specific conversation
@app.route("/api/chat/<int:conv_id>/messages", methods=["GET"])
@login_required
def get_messages(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404() #search for that convo in database
    msgs = Message.query.filter_by(conversation_id=conv.id)\
           .order_by(Message.created_at).all()   #get all the messages of that convo in descending order
    return jsonify([{"role": m.role, "content": m.content} for m in msgs])  #return that json object to javascript


# 5. Send message + stream response
@app.route("/api/chat/<int:conv_id>/message", methods=["POST"])
@login_required
def send_message(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404() #get the convo first
    data = request.get_json() #get the data send by javascript
    user_text = data.get("message", "").strip()   #it will strip the user message for any additional spaces

    if not user_text:  #if user did not send any message return error
        return jsonify({"error": "Empty message"}), 400

    # Save user message  
    user_msg = Message(conversation_id=conv.id, role="user", content=user_text)
    db.session.add(user_msg)
    db.session.commit()

    # Generate title after first message
    history = Message.query.filter_by(conversation_id=conv.id)\
              .order_by(Message.created_at).all()#get all the previous messages for that convo

    if len(history) == 1:   #if the history does not have any message and user_text is the first message then send it to openai for title
        title_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Generate a short 4-5 word title for this chat. Return only the title, nothing else."},
                {"role": "user", "content": user_text}
            ]
        )
        conv.title = title_response.choices[0].message.content.strip()
        db.session.commit() #update that title to convo

    # Build history for OpenAI
    messages = [{"role": "system", "content": build_system_prompt(current_user)}] #list of dictionary for openai to know the context
    for msg in history:  #loop through the messages in history and append them in the list
        messages.append({"role": msg.role, "content": msg.content})

    # Store conv.id in plain variable BEFORE generate()
    conversation_id = conv.id 

    def generate():  #this code is for streaming chunks 
        full_response = ""

        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            stream=True
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_response += delta
                yield delta

        # Use conversation_id variable NOT conv.id
        with app.app_context():
            assistant_msg = Message(
                conversation_id=conversation_id,  # ← CHANGED
                role="assistant",
                content=full_response
            )
            db.session.add(assistant_msg)
            db.session.commit()

    return Response(stream_with_context(generate()), mimetype="text/plain") #streams chunks to javascript as they get generated

# 2. Create new conversation
@app.route("/api/chat/new", methods=["POST"])
@login_required
def new_conversation():
    conv = Conversation(user_id=current_user.id)
    db.session.add(conv)
    db.session.commit()
    return jsonify({"conversation_id": conv.id})


# 3. Get all conversations for sidebar
@app.route("/api/chat/history", methods=["GET"])
@login_required
def chat_history():
    convos = Conversation.query.filter_by(user_id=current_user.id)\
             .order_by(Conversation.created_at.desc()).all() #gets all the convo history of that user in descending order
    return jsonify([
        {"id": c.id, "title": c.title, "created_at": c.created_at.strftime("%d %b")} #returns json response to javascript
        for c in convos
    ])


# 4. Get messages for a specific conversation
@app.route("/api/chat/<int:conv_id>/messages", methods=["GET"])
@login_required
def get_messages(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404() #search for that convo in database
    msgs = Message.query.filter_by(conversation_id=conv.id)\
           .order_by(Message.created_at).all()   #get all the messages of that convo in descending order
    return jsonify([{"role": m.role, "content": m.content} for m in msgs])  #return that json object to javascript


# 5. Send message + stream response
@app.route("/api/chat/<int:conv_id>/message", methods=["POST"])
@login_required
def send_message(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404() #get the convo first
    data = request.get_json() #get the data send by javascript
    user_text = data.get("message", "").strip()   #it will strip the user message for any additional spaces

    if not user_text:  #if user did not send any message return error
        return jsonify({"error": "Empty message"}), 400

    # Save user message  
    user_msg = Message(conversation_id=conv.id, role="user", content=user_text)
    db.session.add(user_msg)
    db.session.commit()

    # Generate title after first message
    history = Message.query.filter_by(conversation_id=conv.id)\
              .order_by(Message.created_at).all()#get all the previous messages for that convo

    if len(history) == 1:   #if the history does not have any message and user_text is the first message then send it to openai for title
        title_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Generate a short 4-5 word title for this chat. Return only the title, nothing else."},
                {"role": "user", "content": user_text}
            ]
        )
        conv.title = title_response.choices[0].message.content.strip()
        db.session.commit() #update that title to convo

    # Build history for OpenAI
    messages = [{"role": "system", "content": build_system_prompt(current_user)}] #list of dictionary for openai to know the context
    for msg in history:  #loop through the messages in history and append them in the list
        messages.append({"role": msg.role, "content": msg.content})

    # Store conv.id in plain variable BEFORE generate()
    conversation_id = conv.id 

    def generate():  #this code is for streaming chunks 
        full_response = ""

        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            stream=True
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_response += delta
                yield delta

        # Use conversation_id variable NOT conv.id
        with app.app_context():
            assistant_msg = Message(
                conversation_id=conversation_id,  # ← CHANGED
                role="assistant",
                content=full_response
            )
            db.session.add(assistant_msg)
            db.session.commit()

    return Response(stream_with_context(generate()), mimetype="text/plain") #streams chunks to javascript as they get generated

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

@app.route('/save-cart', methods=['POST'])
@login_required
def save_cart():
    data = request.get_json()
    session['cart_items'] = data.get('items', [])
    session['time_slot']  = data.get('timeSlot', '')
    session['canteen_id'] = data.get('canteenId', '1')
    session['order_type'] = data.get('orderType', 'takeaway')  # 'takeaway' or 'dinein'
    return jsonify({'ok': True})

@app.route('/checkout')
@login_required
def checkout_page():
    canteen_id    = session.get('canteen_id', '1')
    canteen_names = {'1': 'Main Cafe', '2': 'Tea Post', '3': 'Bistro'}
    order = {
        'user_name':    current_user.username,
        'canteen_name': canteen_names.get(canteen_id, 'Canteen'),
        'food_items':   session.get('cart_items', []),
        'time_slot':    session.get('time_slot', ''),
        'order_type':   session.get('order_type', 'takeaway'),
        'order_date':   datetime.now().strftime('%d %B %Y'),
    }
    total = sum(i['price'] * i['qty'] for i in order['food_items'])
    return render_template('checkout.html', order=order, total=total,
                           canteen=canteen_id, active='canteen',
                           razorpay_key_id=RZP_KEY_ID)

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
        ('instant food',     ['bun', 'fingers', 'shots', 'noodles', 'shots', 'bread', 'bun']),
        ('snacks',   ['poha','upma','thepla','samosa','khichu',''])
    ],
    'bistro': [
        ('snacks',    ['burger', 'pizza', 'fries', 'sandwich', 'panini', 'nachos', 'tikki']),
        ('pasta',     ['pasta', 'spaghetti', 'penne', 'macaroni']),
        ('beverages', ['juice', 'soda', 'mojito', 'lemonade', 'smoothie', 'cold coffee', 'milkshake']),
    ],
}

def assign_category(name_lower, canteen):
    rules = CATEGORY_RULES.get(canteen, [])    # Get the category rules for the specified canteen
    for category, keywords in rules:
        for kw in keywords:
            if kw in name_lower:
                return category
    return 'other'


def strip_ext(filename):                   # Remove all extensions from the filename 
    current_name = filename
    while True:
        base, ext = os.path.splitext(current_name)
        if ext.lower() in VALID_EXTENSIONS:
            current_name = base
        else:
            break
    return current_name

def clean_name(raw):
    raw = re.sub(r'\(.*?\)', '', raw)
    raw = raw.replace('_', ' ').strip()
    raw = re.sub(r'\s+', ' ', raw)
    return raw.title()

def parse_filename(filename):    # Given a filename extract the name and price.
    current_name  = strip_ext(filename)     # Remove all extensions from the filename
    parts = current_name.split('_')
    price_index = None
    for i in range(len(parts) - 1, -1, -1):
        token = parts[i].strip('.')
        if token.isdigit():       # Check if the token is a valid integer (price)
            price_index = i
            break
    if price_index is None:         # If no price token found, return None to skip this file
        return None
    try:
        price = int(parts[price_index].strip('.'))
    except ValueError:
        return None
    name_parts = parts[:price_index]       # The name is everything before the price token basically slicing 
    name_raw   = '_'.join(name_parts)
    name       = clean_name(name_raw)      # Final cleaning of the name 
    if not name:
        return None
    return name, price


# ── Canteen API routes ────────────────────────────────────────────────────────
CANTEEN_PARAM_MAP = {
    '1': 'main_cafe',
    '2': 'tea_post',
    '3': 'bistro',
}

@app.route('/api/menu')          #API endpoint to fetch menu items (GET requets)
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
        for filename in sorted(os.listdir(canteen_path)):        #Loop through images in the canteen folder and extract name, price, category
            _, outermost_ext = os.path.splitext(filename)        # Only check the outermost extension to determine if it's a valid image file
            if outermost_ext.lower() not in VALID_EXTENSIONS:
                continue
            parsed = parse_filename(filename)                    #Extract name and price from the filename using the defined parsing logic
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
    data = request.get_json()     # Extracts request body (sent from frontend)

    # DEBUG: Log what we received
    app.logger.info(f"[place_order] User {current_user.id} sent: {data}")   #Logs request for debugging

    if not data:
        app.logger.warning("[place_order] No data provided")
        return jsonify({'error': 'No data provided'}), 400

    items = data.get('items', [])
    if not items or not isinstance(items, list):
        app.logger.warning("[place_order] Invalid items")
        return jsonify({'error': 'Items must be a non-empty list'}), 400

    # Process items — CONVERT strings to integers (frontend sends strings)
    processed_items = []
    calculated_total = 0

    for i, item in enumerate(items):   #Loop through each item in the order and validate/convert data
        name = item.get('name', '')

        # Convert price/qty to int, accept strings too
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
        total = calculated_total

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
                'status':     order.status or 'success',
                'reason':     order.reason or '',
                'payment_id': order.payment_id or '',
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
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True)
