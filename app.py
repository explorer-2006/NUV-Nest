from flask import Flask, request, redirect, flash, render_template, url_for, jsonify, Response, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, LoginManager, logout_user, login_user, current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, EmailField, SubmitField, SelectField
from wtforms.validators import DataRequired, Email, Length
from werkzeug.security import generate_password_hash, check_password_hash
import os
from dotenv import load_dotenv
from openai import OpenAI
from datetime import datetime


app = Flask(__name__, template_folder="templates")   #instance
app.secret_key = "supersecretkeythatnooneissupposetoknow"    #setting up the secret key for csrf protection
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///UserRecords.db"   

db = SQLAlchemy(app)
login_manager = LoginManager(app)      #setting up loginmanager and telling it which app to manage 
login_manager.login_view = "login"     #if user not logged in will redirect to login page

# ── School → Branch mapping ──
SCHOOL_BRANCHES = {                    #code for drop down
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
class User(db.Model, UserMixin):    #setting up the records table to store user data... 
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


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)