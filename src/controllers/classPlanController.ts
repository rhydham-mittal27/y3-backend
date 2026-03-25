import { Request, Response, NextFunction } from 'express';
import ClassPlan from '../models/ClassPlan';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { isValidObjectId } from 'mongoose';

/**
 * @desc    Create or update a class plan
 * @route   POST /api/class-plans
 * @access  Private (Admin/Manager)
 */
export const createOrUpdatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, monthlyFee, sessionsPerMonth, tutorMonthlyFee, status } = req.body;

    if (!classId || !isValidObjectId(classId)) {
      throw new ErrorResponse('Invalid or missing Class ID', 400);
    }

    if (monthlyFee < 0) throw new ErrorResponse('Monthly fee cannot be negative', 400);
    if (sessionsPerMonth <= 0) throw new ErrorResponse('Sessions per month must be greater than 0', 400);

    const finalClass = await FinalClass.findById(classId);
    if (!finalClass) {
      throw new ErrorResponse('Class not found', 404);
    }

    // Check if an active plan exists, if so archive it or update it?
    // Requirement says "create a class plan schema", implying there is one active plan.
    // We will archive exiting active plans for this class to keep history, then create new one.
    
    await ClassPlan.updateMany(
      { classId, status: 'ACTIVE' },
      { status: 'ARCHIVED' }
    );

    const newPlan = await ClassPlan.create({
      classId,
      parentId: finalClass.parent,
      currentTutorId: finalClass.tutor,
      monthlyFee,
      tutorMonthlyFee: tutorMonthlyFee || 0,
      sessionsPerMonth,
      // perSessionFee and tutorPerSessionFee are calculated in pre-save hook
      status: status || 'ACTIVE',
    });

    // Also update the FinalClass model with these details for quick access if needed, 
    // though the Plan is now the source of truth.
    // The requirement says "Parents always pay full monthly plan", "No partial purchase".
    // We might want to sync this back to FinalClass if it has similar fields (it has monthlyFees).
    finalClass.monthlyFees = monthlyFee;
    finalClass.ratePerSession = monthlyFee / sessionsPerMonth;
    finalClass.tutorMonthlyFees = tutorMonthlyFee || 0;
    finalClass.tutorRatePerSession = (tutorMonthlyFee || 0) / sessionsPerMonth;
    finalClass.classesPerMonth = sessionsPerMonth;
    await finalClass.save();

    res.status(201).json({
      success: true,
      data: newPlan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active plan for a class
 * @route   GET /api/class-plans/:classId
 * @access  Private
 */
export const getPlanByClassId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = req.params;

    if (!isValidObjectId(classId)) {
      throw new ErrorResponse('Invalid Class ID', 400);
    }

    const plan = await ClassPlan.findOne({ classId, status: 'ACTIVE' }).sort({ createdAt: -1 });

    if (!plan) {
      // If no plan exists for this class, fetch the FinalClass (with lead) to provide current fees as defaults
      const finalClass = await FinalClass.findById(classId).populate('classLead');
      
      if (finalClass) {
        const lead = finalClass.classLead as any;
        
        // Final fallback chain:
        // 1. Explicit monthly fees in FinalClass
        // 2. Calculated from rates in FinalClass
        // 3. Original amounts from Lead
        const sessionsPerMonth = finalClass.classesPerMonth || (lead ? lead.classesPerMonth : 8) || 8;
        
        const monthlyFee = finalClass.monthlyFees || 
                          ((finalClass.ratePerSession || 0) * sessionsPerMonth) || 
                          (lead ? lead.paymentAmount : 0) || 0;
                          
        const tutorMonthlyFee = finalClass.tutorMonthlyFees || 
                               ((finalClass.tutorRatePerSession || 0) * sessionsPerMonth) || 
                               (lead ? lead.tutorFees : 0) || 0;

        res.status(200).json({
          success: true,
          data: {
            classId,
            monthlyFee,
            tutorMonthlyFee,
            sessionsPerMonth,
            perSessionFee: sessionsPerMonth > 0 ? monthlyFee / sessionsPerMonth : 0,
            tutorPerSessionFee: sessionsPerMonth > 0 ? tutorMonthlyFee / sessionsPerMonth : 0,
            status: 'ACTIVE',
            isInitial: true // Optional flag for frontend
          }
        });
        return;
      }

      res.status(200).json({ success: true, data: null });
      return;
    }

    res.status(200).json({
      success: true,
      data: plan,
    });
    return;
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a plan directly
 * @route   PATCH /api/class-plans/:id
 * @access  Private
 */
export const updatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!isValidObjectId(id)) {
      throw new ErrorResponse('Invalid Plan ID', 400);
    }

    const plan = await ClassPlan.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!plan) {
      throw new ErrorResponse('Plan not found', 404);
    }
    
    // Recalculate if fee/sessions changed (although pre-save hook handles creating, update might skip if not careful, 
    // but findByIdAndUpdate doesn't run pre-save. It runs pre-validate if configured. 
    // Better to handle calculation explicitly if needed, or rely on client to send complete data?
    // Actually, for consistency, if monthlyFee or sessionsPerMonth changed, we should recalc perSessionFee.
    
    // Pre-validate hook in model handles calculations of perSessionFee and tutorPerSessionFee
    // We just need to ensure save() is called if we changed any relevant fields
    const needsRecalc = 
      updateData.monthlyFee !== undefined || 
      updateData.tutorMonthlyFee !== undefined || 
      updateData.sessionsPerMonth !== undefined;
    
    if (needsRecalc) {
      // Data is already applied to plan via findByIdAndUpdate with {new: true}
      // But findByIdAndUpdate skip hooks, so we call save() explicitly
      await plan.save();
    }

     // Sync back to class if it's the active plan
     if (plan.status === 'ACTIVE') {
        const finalClass = await FinalClass.findById(plan.classId);
        if (finalClass) {
            finalClass.monthlyFees = plan.monthlyFee;
            finalClass.ratePerSession = plan.perSessionFee;
            finalClass.tutorMonthlyFees = plan.tutorMonthlyFee;
            finalClass.tutorRatePerSession = plan.tutorPerSessionFee;
            finalClass.classesPerMonth = plan.sessionsPerMonth;
            await finalClass.save();
        }
     }

    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};
