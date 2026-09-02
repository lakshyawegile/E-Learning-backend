const express = require('express');
const { getCourses, getCourseById, getMyEnrolledCourses, updateCourse } = require('../controllers/courseController');
const {
  createLesson,
  listLessonsByCourse,
  getLessonById,
  updateLesson,
  deleteLesson,
} = require('../controllers/lessonController');
const {
  listChaptersByCourse,
  createChapter,
  updateChapter,
  deleteChapter,
} = require('../controllers/chapterController');

const router = express.Router();

router.get('/', getCourses);
router.get('/my', getMyEnrolledCourses);
router.get('/:courseId/chapters', listChaptersByCourse);
router.post('/:courseId/chapters', createChapter);
router.put('/:courseId/chapters/:chapterId', updateChapter);
router.delete('/:courseId/chapters/:chapterId', deleteChapter);
router.get('/:courseId/lessons', listLessonsByCourse);
router.post('/:courseId/lessons', createLesson);
router.get('/:courseId/lessons/:lessonId', getLessonById);
router.put('/:courseId/lessons/:lessonId', updateLesson);
router.delete('/:courseId/lessons/:lessonId', deleteLesson);
router.get('/:courseId', getCourseById);
router.put('/:courseId', updateCourse);

module.exports = router;

