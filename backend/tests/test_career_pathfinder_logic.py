import unittest

from services.career_pathfinder import (
    _contains_skill,
    _experience_mismatch,
    _score_job_fit,
    _skill_matches,
)


class CareerPathfinderLogicTests(unittest.TestCase):
    def test_siem_does_not_match_siemens(self):
        self.assertFalse(_contains_skill("Senior ML Engineer at Siemens", "SIEM"))

    def test_resume_skill_matching_is_exact(self):
        self.assertTrue(_skill_matches("Machine Learning", ["Python", "Machine Learning"]))
        self.assertFalse(_skill_matches("AI", ["Generative AI"]))

    def test_junior_is_penalized_for_senior_listing(self):
        mismatch, reason = _experience_mismatch(
            "Junior",
            "Senior ML Engineer",
            "Requires 6-9 years of production experience.",
        )
        self.assertTrue(mismatch)
        self.assertIn("mismatch", reason.lower())

        fit = _score_job_fit(
            {
                "title": "Senior ML Engineer",
                "snippet": "Requires 6-9 years. Python and Machine Learning.",
                "skills": ["Python", "Machine Learning"],
                "link": "https://example.com/job/1",
                "source": "example.com",
                "date": "Today",
            },
            ["Python", "Machine Learning"],
            "ML Engineer",
            "Junior",
        )
        self.assertLessEqual(fit["score"], 35)
        self.assertTrue(fit["experience_mismatch"])

    def test_aggregate_page_is_not_a_perfect_match(self):
        fit = _score_job_fit(
            {
                "title": "1,000+ Machine Learning Engineer jobs in Bengaluru",
                "snippet": "Python Machine Learning jobs in Bengaluru.",
                "skills": ["Python", "Machine Learning"],
                "link": "https://example.com/jobs",
                "source": "example.com",
                "date": "Today",
            },
            ["Python", "Machine Learning"],
            "ML Engineer",
            "Junior",
        )
        self.assertLessEqual(fit["score"], 70)
        self.assertTrue(fit["aggregate_result"])
        self.assertTrue(fit["low_detail_source"])
        self.assertIn("Deep Learning", fit["missing_skills"])
        self.assertIn("TensorFlow", fit["missing_skills"])


if __name__ == "__main__":
    unittest.main()
