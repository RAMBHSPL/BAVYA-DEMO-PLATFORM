import os
import json
import time
import random
import pymysql
import pymysql.cursors
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load local environment configurations from .env
load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Configure directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Upload directory (supports local fallback or persistent path mount)
PERSISTENT_DIR = os.environ.get('PERSISTENT_STORAGE_DIR')
if PERSISTENT_DIR:
    UPLOADS_DIR = os.path.join(PERSISTENT_DIR, 'uploads')
else:
    UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')

os.makedirs(UPLOADS_DIR, exist_ok=True)

# MySQL Connection Configurations (with default fallbacks for local dev)
MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
MYSQL_DB = os.environ.get('MYSQL_DB', 'bavya_video_portal')
MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))

def get_db_connection():
    return pymysql.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        port=MYSQL_PORT,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def init_db_schema():
    # Retry database connection on startup in case service is booting up
    retries = 5
    conn = None
    while retries > 0:
        try:
            conn = pymysql.connect(
                host=MYSQL_HOST,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                port=MYSQL_PORT,
                autocommit=True
            )
            break
        except Exception as e:
            print(f"Waiting for MySQL database connection... Retries left: {retries}. Error: {e}")
            retries -= 1
            time.sleep(3)

    if not conn:
        print("CRITICAL: Could not connect to MySQL server. Please verify settings.")
        return

    try:
        with conn.cursor() as cursor:
            # Create Database
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_DB}")
            print(f"Verified database '{MYSQL_DB}' exists.")
    finally:
        conn.close()

    # Create Tables
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Projects Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    name VARCHAR(255) PRIMARY KEY
                )
            """)

            # 2. Settings Table (For dynamic fields and ordering)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    settings_key VARCHAR(255) PRIMARY KEY,
                    settings_value LONGTEXT
                )
            """)

            # 3. Videos Table (Stores metadata and JSON fields for tracks/tags)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS videos (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    project_name VARCHAR(255),
                    tags LONGTEXT,
                    video_file TEXT,
                    thumbnail LONGTEXT,
                    custom_data LONGTEXT,
                    created_at BIGINT,
                    subtitles LONGTEXT,
                    audio_tracks LONGTEXT
                )
            """)
            print("Verified MySQL table schemas.")

            # Seed default projects if empty
            cursor.execute("SELECT COUNT(*) as count FROM projects")
            res = cursor.fetchone()
            if res['count'] == 0:
                defaults = ['Project 104', 'BHSPL Core', 'HTML Portal', 'Alpha Testing']
                cursor.executemany("INSERT INTO projects (name) VALUES (%s)", defaults)
                print("Seeded default projects configuration.")
    except Exception as e:
        print(f"Error initializing MySQL schema: {e}")
    finally:
        conn.close()

# Serve index.html as fallback catch-all
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Serve static files from the uploads directory
@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOADS_DIR, filename)

# =========================================================================
# API ROUTES
# =========================================================================

# Get Videos List
@app.route('/api/videos', methods=['GET'])
def get_videos():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM videos ORDER BY created_at DESC")
            rows = cursor.fetchall()
            
            videos = []
            for row in rows:
                videos.append({
                    'id': row['id'],
                    'name': row['name'],
                    'projectName': row['project_name'],
                    'tags': json.loads(row['tags']) if row['tags'] else [],
                    'videoFile': row['video_file'],
                    'thumbnail': row['thumbnail'],
                    'customData': json.loads(row['custom_data']) if row['custom_data'] else {},
                    'createdAt': row['created_at'],
                    'subtitles': json.loads(row['subtitles']) if row['subtitles'] else [],
                    'audioTracks': json.loads(row['audio_tracks']) if row['audio_tracks'] else []
                })
            return jsonify(videos)
    except Exception as e:
        print(f"Error retrieving videos: {e}")
        return jsonify([]), 500
    finally:
        conn.close()

# Upload Video & Metadata
@app.route('/api/videos', methods=['POST'])
def add_video():
    try:
        # Extract fields
        video_id = request.form.get('id')
        name = request.form.get('name')
        project_name = request.form.get('projectName')
        tags = request.form.get('tags')
        custom_data = request.form.get('customData')
        created_at = request.form.get('createdAt')
        video_file_url = request.form.get('videoFileUrl')
        thumbnail_url = request.form.get('thumbnailUrl')
        thumbnail_data = request.form.get('thumbnailData')
        subtitles_metadata = request.form.get('subtitlesMetadata')
        audio_tracks_metadata = request.form.get('audioTracksMetadata')

        parsed_tags = json.loads(tags) if tags else []
        parsed_custom_data = json.loads(custom_data) if custom_data else {}
        parsed_subtitles_meta = json.loads(subtitles_metadata) if subtitles_metadata else []
        parsed_audio_tracks_meta = json.loads(audio_tracks_metadata) if audio_tracks_metadata else []

        # Handle file uploads
        files_map = {}
        for fieldname, file in request.files.items():
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                ext = os.path.splitext(filename)[1]
                unique_filename = f"{int(time.time())}-{random.randint(1, 10**9)}{ext}"
                filepath = os.path.join(UPLOADS_DIR, unique_filename)
                file.save(filepath)
                files_map[fieldname] = f"/uploads/{unique_filename}"

        # Determine video source file path
        video_file = video_file_url or ''
        if 'videoFile' in files_map:
            video_file = files_map['videoFile']

        # Determine thumbnail path
        thumbnail = thumbnail_url or ''
        if 'thumbnailFile' in files_map:
            thumbnail = files_map['thumbnailFile']
        elif thumbnail_data:
            thumbnail = thumbnail_data  # Base64 thumbnail

        # Process subtitle tracks
        subtitles = []
        for sub in parsed_subtitles_meta:
            file_path = sub.get('fileUrl', '')
            file_field = sub.get('fileField')
            if file_field and file_field in files_map:
                file_path = files_map[file_field]
            subtitles.append({
                'languageCode': sub.get('languageCode'),
                'languageLabel': sub.get('languageLabel'),
                'file': file_path,
                'name': sub.get('name')
            })

        # Process voiceover audio tracks
        audio_tracks = []
        for track in parsed_audio_tracks_meta:
            file_path = track.get('fileUrl', '')
            file_field = track.get('fileField')
            if file_field and file_field in files_map:
                file_path = files_map[file_field]
            audio_tracks.append({
                'languageCode': track.get('languageCode'),
                'languageLabel': track.get('languageLabel'),
                'file': file_path,
                'name': track.get('name')
            })

        # Upsert in MySQL database
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO videos (id, name, project_name, tags, video_file, thumbnail, custom_data, created_at, subtitles, audio_tracks)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        project_name = VALUES(project_name),
                        tags = VALUES(tags),
                        video_file = VALUES(video_file),
                        thumbnail = VALUES(thumbnail),
                        custom_data = VALUES(custom_data),
                        created_at = VALUES(created_at),
                        subtitles = VALUES(subtitles),
                        audio_tracks = VALUES(audio_tracks)
                """
                cursor.execute(sql, (
                    video_id,
                    name,
                    project_name,
                    json.dumps(parsed_tags),
                    video_file,
                    thumbnail,
                    json.dumps(parsed_custom_data),
                    int(created_at) if created_at else int(time.time() * 1000),
                    json.dumps(subtitles),
                    json.dumps(audio_tracks)
                ))
        finally:
            conn.close()

        video_record = {
            'id': video_id,
            'name': name,
            'projectName': project_name,
            'tags': parsed_tags,
            'videoFile': video_file,
            'thumbnail': thumbnail,
            'customData': parsed_custom_data,
            'createdAt': int(created_at) if created_at else int(time.time() * 1000),
            'subtitles': subtitles,
            'audioTracks': audio_tracks
        }
        return jsonify(video_record)

    except Exception as e:
        print(f"Error handling video upload: {e}")
        return jsonify({'message': 'Internal Server Error during upload processing'}), 500

# Delete Video
@app.route('/api/videos/<string:video_id>', methods=['DELETE'])
def delete_video(video_id):
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM videos WHERE id = %s", (video_id,))
                video = cursor.fetchone()
                
                if video:
                    # Helper function to delete files from uploads folder
                    def delete_file_from_disk(file_path):
                        if file_path and file_path.startswith('/uploads/'):
                            filename = os.path.basename(file_path)
                            absolute_path = os.path.join(UPLOADS_DIR, filename)
                            if os.path.exists(absolute_path):
                                try:
                                    os.remove(absolute_path)
                                except Exception as e:
                                    print(f"Failed to delete file from disk {absolute_path}: {e}")

                    # Clean uploaded assets
                    delete_file_from_disk(video.get('video_file'))
                    delete_file_from_disk(video.get('thumbnail'))
                    
                    subtitles = json.loads(video.get('subtitles')) if video.get('subtitles') else []
                    audio_tracks = json.loads(video.get('audio_tracks')) if video.get('audio_tracks') else []
                    
                    for sub in subtitles:
                        delete_file_from_disk(sub.get('file'))
                    for track in audio_tracks:
                        delete_file_from_disk(track.get('file'))

                    # Remove record from database
                    cursor.execute("DELETE FROM videos WHERE id = %s", (video_id,))
        finally:
            conn.close()

        return jsonify({'success': True, 'message': 'Video asset deleted successfully'})

    except Exception as e:
        print(f"Delete Error: {e}")
        return jsonify({'message': 'Failed to delete video record'}), 500

# Projects List API
@app.route('/api/projects', methods=['GET'])
def get_projects():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name FROM projects")
            rows = cursor.fetchall()
            projects = [row['name'] for row in rows]
            return jsonify(projects)
    except Exception as e:
        print(f"Error fetching projects: {e}")
        return jsonify(['Project 104', 'BHSPL Core', 'HTML Portal', 'Alpha Testing'])
    finally:
        conn.close()

@app.route('/api/projects', methods=['POST'])
def save_projects():
    try:
        data = request.get_json() or {}
        project_list = data.get('list', [])
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM projects")
                if project_list:
                    cursor.executemany("INSERT INTO projects (name) VALUES (%s)", [[p] for p in project_list])
            return jsonify({'success': True})
        finally:
            conn.close()
    except Exception as e:
        print(f"Error saving projects: {e}")
        return jsonify({'message': 'Failed to save projects list'}), 500

# Custom Fields API
@app.route('/api/custom-fields', methods=['GET'])
def get_custom_fields():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT settings_value FROM settings WHERE settings_key = 'custom_fields'")
            row = cursor.fetchone()
            if row:
                return jsonify(json.loads(row['settings_value']))
            return jsonify([])
    except Exception as e:
        print(f"Error loading custom fields: {e}")
        return jsonify([])
    finally:
        conn.close()

@app.route('/api/custom-fields', methods=['POST'])
def save_custom_fields():
    try:
        data = request.get_json() or {}
        fields = data.get('fields', [])
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO settings (settings_key, settings_value)
                    VALUES ('custom_fields', %s)
                    ON DUPLICATE KEY UPDATE settings_value = VALUES(settings_value)
                """
                cursor.execute(sql, (json.dumps(fields),))
            return jsonify({'success': True})
        finally:
            conn.close()
    except Exception as e:
        print(f"Error saving custom fields: {e}")
        return jsonify({'message': 'Failed to save custom fields configuration'}), 500

# Sort Order API
@app.route('/api/video-order', methods=['GET'])
def get_video_order():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT settings_value FROM settings WHERE settings_key = 'video_order'")
            row = cursor.fetchone()
            if row:
                return jsonify(json.loads(row['settings_value']))
            return jsonify([])
    except Exception as e:
        print(f"Error loading sort order: {e}")
        return jsonify([])
    finally:
        conn.close()

@app.route('/api/video-order', methods=['POST'])
def save_video_order():
    try:
        data = request.get_json() or {}
        order = data.get('order', [])
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO settings (settings_key, settings_value)
                    VALUES ('video_order', %s)
                    ON DUPLICATE KEY UPDATE settings_value = VALUES(settings_value)
                """
                cursor.execute(sql, (json.dumps(order),))
            return jsonify({'success': True})
        finally:
            conn.close()
    except Exception as e:
        print(f"Error saving sort order: {e}")
        return jsonify({'message': 'Failed to save video display order'}), 500

# Fallback route to serve static client files (JS, CSS, HTML)
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# Bootstrap database schema on startup
init_db_schema()

if __name__ == '__main__':
    print("===================================================")
    print("BAVYA DEMO Video Portal Running (Python Flask + MySQL)")
    print("Local Access URL: http://127.0.0.1:5000")
    print("===================================================")
    app.run(host='127.0.0.1', port=5000, debug=True)
