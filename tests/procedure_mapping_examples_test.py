import unittest
from scripts.build_procedure_library import canonicalize_to_primary


class ProcedureMappingExamplesTest(unittest.TestCase):
    def test_lap_chole_variants_collapse_to_same_primary(self):
        a = canonicalize_to_primary(
            'GALLBLADDER, VARIOUS LESIONS, LAPAROSCOPIC CHOLECYSTECTOMY WITH INTRAOPERATIVE CHOLANGIOGRAM',
            'digestive',
        )
        b = canonicalize_to_primary(
            'GALLBLADDER, VARIOUS LESIONS, CHOLECYSTECTOMY',
            'digestive',
        )
        self.assertEqual(a[0], b[0])
        self.assertIn('laparoscopic', a[1])
        self.assertIn('cholangiogram', a[1])

    def test_robotic_modifier_collapses(self):
        a = canonicalize_to_primary('PROSTATE, TUMOR, ROBOTIC PROSTATECTOMY', 'male_genital')
        b = canonicalize_to_primary('PROSTATE, TUMOR, PROSTATECTOMY', 'male_genital')
        self.assertEqual(a[0], b[0])
        self.assertIn('robotic', a[1])

    def test_ob_categories_not_collapsed(self):
        labor = canonicalize_to_primary('OBSTETRIC LABOR ANALGESIA, EPIDURAL', 'female_genital')
        cs = canonicalize_to_primary('OBSTETRIC CESAREAN DELIVERY', 'female_genital')
        self.assertNotEqual(labor[0], cs[0])


if __name__ == '__main__':
    unittest.main()
